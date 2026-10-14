// src/main/java/com/nathcorp/QAPortal/service/SharePointIngestionService.java
package com.nathcorp.QAPortal.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.tika.Tika;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SharePointIngestionService {

    private final VectorStore vectorStore;

    private final Tika tika = new Tika();
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    // simple runtime cache (optional). For production, persist this in Cosmos.
    private final Set<String> indexedDocIds = ConcurrentHashMap.newKeySet();

    private final Path cacheDir = Paths.get("sp-cache");

    public SharePointIngestionService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public record IngestSummary(int success, int skipped, int failed, List<String> errors) {}

    public IngestSummary ensureIndexed(List<String> links, String project, String version, boolean forceReindex) {
        if (links == null || links.isEmpty()) {
            return new IngestSummary(0, 0, 0, List.of("No SharePoint links provided."));
        }
        if (project == null || project.isBlank()) {
            return new IngestSummary(0, 0, links.size(), List.of("project is required"));
        }
        if (version == null || version.isBlank()) {
            return new IngestSummary(0, 0, links.size(), List.of("version is required"));
        }

        try {
            Files.createDirectories(cacheDir);
        } catch (Exception e) {
            return new IngestSummary(0, 0, links.size(), List.of("Cannot create cache dir: " + e.getMessage()));
        }

        int ok = 0, skip = 0, fail = 0;
        List<String> errors = new ArrayList<>();

        for (String link : links) {
            if (link == null || link.isBlank()) continue;

            String docId = sha1(link);
            if (!forceReindex && indexedDocIds.contains(docId)) {
                skip++;
                continue;
            }

            try {
                Path filePath = downloadToCache(link, docId);

                Extracted extracted = extractText(filePath);

                if (extracted.totalChars < 50) {
                    fail++;
                    errors.add("No extractable text: " + extracted.fileName + " (" + link + ")");
                    continue;
                }

                List<Document> docs = buildDocs(extracted, docId, link, project, version);

                if (docs.isEmpty()) {
                    fail++;
                    errors.add("Chunking produced 0 docs: " + extracted.fileName + " (" + link + ")");
                    continue;
                }

                vectorStore.add(docs);

                indexedDocIds.add(docId);
                ok++;

            } catch (Exception e) {
                fail++;
                errors.add("Failed for link: " + link + " | " + e.getMessage());
            }
        }

        return new IngestSummary(ok, skip, fail, errors);
    }

    // -----------------------------
    // Download
    // -----------------------------
    private Path downloadToCache(String url, String docId) throws Exception {
        String fileName = guessFileName(url);
        Path target = cacheDir.resolve(docId + "-" + fileName);

        // already cached
        if (Files.exists(target) && Files.size(target) > 0) return target;

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .GET()
                .build();

        HttpResponse<InputStream> resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());

        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("HTTP " + resp.statusCode() + " downloading " + url
                    + " (SharePoint may require auth token)");
        }

        try (InputStream in = resp.body()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }

        return target;
    }

    private String guessFileName(String url) {
        try {
            String path = URI.create(url).getPath();
            if (path == null) return "file";
            String last = path.substring(path.lastIndexOf('/') + 1);
            if (last.isBlank()) return "file";
            return last.replaceAll("[\\\\/]", "_");
        } catch (Exception e) {
            return "file";
        }
    }

    // -----------------------------
    // Extract
    // -----------------------------
    private record Extracted(String fileName, List<PageText> pages, int totalChars) {}
    private record PageText(int page, String text) {}

    private Extracted extractText(Path filePath) throws Exception {
        String name = filePath.getFileName().toString();
        String lower = name.toLowerCase(Locale.ROOT);

        if (lower.endsWith(".pdf")) {
            List<PageText> pages = extractPdfPages(filePath);
            int totalChars = pages.stream().mapToInt(p -> p.text == null ? 0 : p.text.trim().length()).sum();
            return new Extracted(name, pages, totalChars);
        }

        // everything else via Tika as "single page"
        String text = tika.parseToString(filePath.toFile());
        text = (text == null) ? "" : text;
        int totalChars = text.trim().length();
        return new Extracted(name, List.of(new PageText(1, text)), totalChars);
    }

    private List<PageText> extractPdfPages(Path pdfPath) throws Exception {
        List<PageText> pages = new ArrayList<>();
        try (PDDocument doc = Loader.loadPDF(pdfPath.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            int total = doc.getNumberOfPages();
            for (int i = 1; i <= total; i++) {
                stripper.setStartPage(i);
                stripper.setEndPage(i);
                String pageText = stripper.getText(doc);
                pages.add(new PageText(i, pageText == null ? "" : pageText));
            }
        }
        return pages;
    }

    // -----------------------------
    // Chunk + Build docs
    // -----------------------------
    private List<Document> buildDocs(Extracted extracted,
                                     String docId,
                                     String sourceUrl,
                                     String project,
                                     String version) {

        List<Document> docs = new ArrayList<>();

        for (PageText p : extracted.pages) {
            List<String> chunks = chunk(p.text, 900, 120);
            int chunkIdx = 0;

            for (String ch : chunks) {
                if (ch == null || ch.isBlank()) continue;

                Map<String, Object> meta = new LinkedHashMap<>();
                meta.put("doc_id", docId);
                meta.put("project", project);
                meta.put("version", version);

                meta.put("source_url", sourceUrl);
                meta.put("fileName", extracted.fileName);
                meta.put("page", p.page);
                meta.put("chunk", chunkIdx++);
                meta.put("ingestedAt", Instant.now().toString());

                docs.add(new Document(ch, meta));
            }
        }

        return docs;
    }

    private List<String> chunk(String text, int chunkSize, int overlap) {
        if (text == null) return List.of();
        String t = text.replace("\r", " ").trim();
        if (t.isBlank()) return List.of();

        int size = Math.max(200, chunkSize);
        int ov = Math.max(0, Math.min(overlap, size - 50));

        List<String> out = new ArrayList<>();
        int start = 0;

        while (start < t.length()) {
            int end = Math.min(t.length(), start + size);
            String part = t.substring(start, end).trim();
            if (!part.isBlank()) out.add(part);

            if (end == t.length()) break;
            start = Math.max(0, end - ov);
        }

        return out;
    }

    private String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return UUID.randomUUID().toString().replace("-", "");
        }
    }
}
