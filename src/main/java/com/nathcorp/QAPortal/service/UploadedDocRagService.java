// src/main/java/com/nathcorp/QAPortal/service/UploadedDocRagService.java
package com.nathcorp.QAPortal.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.Filter;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

@Service
public class UploadedDocRagService {

    private static final String SOURCE_VALUE = "uploaded";

    // metadata keys
    private static final String META_SOURCE = "source";
    private static final String META_USER_ID = "userId";
    private static final String META_SESSION_ID = "sessionId";
    private static final String META_FILE_ID = "fileId";
    private static final String META_FILE_NAME = "fileName";
    private static final String META_PAGE = "page";
    private static final String META_CHUNK = "chunk";
    private static final String META_VECTOR_ID = "vectorId";

    private final VectorStore vectorStore;
    private final Path uploadsRoot;

    public UploadedDocRagService(
            VectorStore vectorStore,
            @Value("${app.uploads.root:uploads}") String uploadsRootPath
    ) {
        this.vectorStore = vectorStore;
        this.uploadsRoot = Paths.get(uploadsRootPath).toAbsolutePath().normalize();

    }

    // ---------------------------
    // Helpers (user + session)
    // ---------------------------
    private String uid(String userId) {
        return userId == null ? "" : userId.trim();
    }

    private String sid(String sessionId) {
        return sessionId == null ? "" : sessionId.trim();
    }

    // filesystem safe (not for metadata)
    private String safeKey(String key) {
        if (key == null) return "";
        String k = key.trim();
        if (k.isBlank()) return "";
        return k.replaceAll("[^a-zA-Z0-9@._-]", "_");
    }

    // ---------------------------
    // Paths for stored ids (per user+session)
    // uploads/<userId>/<sessionId>/
    // ---------------------------
    private Path sessionDir(String userId, String sessionId) {
        return uploadsRoot
                .resolve(safeKey(uid(userId)))
                .resolve(safeKey(sid(sessionId)));
    }

    private Path idsFile(String userId, String sessionId) {
        return sessionDir(userId, sessionId).resolve("vector_ids.txt");
    }

    // ---------------------------
    // SAVE FILE
    // ---------------------------
    public Path saveFile(String userId, String sessionId, String fileId, MultipartFile file) throws Exception {
        String u = uid(userId);
        String s = sid(sessionId);

        if (u.isBlank()) throw new IllegalArgumentException("userId is required");
        if (s.isBlank()) throw new IllegalArgumentException("sessionId is required");
        if (fileId == null || fileId.isBlank()) throw new IllegalArgumentException("fileId is required");
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("file is required");

        Path dir = sessionDir(u, s);
        Files.createDirectories(dir);

        String original = Optional.ofNullable(file.getOriginalFilename()).orElse("file");
        String safe = original.replaceAll("[\\\\/:*?\"<>|]", "_");
        Path target = dir.resolve(fileId + "__" + safe);

        try (InputStream in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    // Backward-compatible overload
    public Path saveFile(String sessionId, String fileId, MultipartFile file) throws Exception {
        return saveFile("unknown-user", sessionId, fileId, file);
    }

    // ---------------------------
    // DELETE PREVIOUS SESSION DATA
    // IMPORTANT:
    // We intentionally do NOT use delete-by-filter fallback here.
    // Some Spring AI vector store combinations can route this path into
    // an invalid embedding request and fail with:
    // '$.input is invalid'
    // ---------------------------
    public void deletePreviousSessionData(String userId, String sessionId) {
        String u = uid(userId);
        String s = sid(sessionId);

        if (u.isBlank() || s.isBlank()) return;

        List<String> ids;
        try {
            ids = readStoredIds(u, s);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to read stored vector ids for userId=" + u + ", sessionId=" + s,
                    e
            );
        }

        if (ids.isEmpty()) {

            try {
                Files.deleteIfExists(idsFile(u, s));
            } catch (Exception ignore) {
            }

            try {
                deleteDirectoryRecursively(sessionDir(u, s));
            } catch (Exception ignore) {
            }

            return;
        }

        try {
            deleteByIds(ids);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to delete previous vectors by ids for userId=" + u + ", sessionId=" + s,
                    e
            );
        }

        try {
            Files.deleteIfExists(idsFile(u, s));
        } catch (Exception ignore) {
        }

        try {
            deleteDirectoryRecursively(sessionDir(u, s));
        } catch (Exception ignore) {
        }
    }

    // Backward-compatible overload
    public void deletePreviousSessionData(String sessionId) {
        deletePreviousSessionData("unknown-user", sessionId);
    }

    // ---------------------------
    // INDEX FILE
    // ---------------------------
    public int indexFile(String userId, String sessionId, String fileId, String fileName, Path filePath) throws Exception {
        String u = uid(userId);
        String s = sid(sessionId);

        if (u.isBlank()) throw new IllegalArgumentException("userId is required");
        if (s.isBlank()) throw new IllegalArgumentException("sessionId is required");
        if (fileId == null || fileId.isBlank()) throw new IllegalArgumentException("fileId is required");
        if (filePath == null || !Files.exists(filePath)) throw new IllegalArgumentException("file not found: " + filePath);

        String name = (fileName == null ? filePath.getFileName().toString() : fileName);
        String lower = name.toLowerCase(Locale.ROOT);

        List<Chunk> rawChunks;
        if (lower.endsWith(".pdf")) rawChunks = extractPdfChunks(filePath);
        else if (lower.endsWith(".docx")) rawChunks = extractDocxChunks(filePath);
        else rawChunks = extractTextChunks(filePath);

        if (rawChunks.isEmpty()) {
            throw new IllegalStateException("No extractable text found. If PDF is scanned/image-only, OCR is required.");
        }

        int chunkIdx = 0;
        int indexedCount = 0;
        int skippedUnsafe = 0;
        int skippedEmpty = 0;
        int filteredByAzure = 0;

        List<String> indexedIds = new ArrayList<>();
        String verifyProbeText = null;


        for (Chunk c : rawChunks) {
            final int currentChunkIdx = chunkIdx++;
            String cleaned = sanitizeForIndexing(c.text);

            if (cleaned.isBlank() || cleaned.length() < 20) {
                skippedEmpty++;
                continue;
            }

            if (shouldSkipChunk(cleaned)) {
                skippedUnsafe++;
                continue;
            }

            String requestedVectorId = u + ":" + s + ":" + fileId + ":p" + c.page + ":c" + currentChunkIdx;
            String azureDocumentId = azureSearchDocumentKey(requestedVectorId);

            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put(META_SOURCE, SOURCE_VALUE);
            meta.put(META_USER_ID, u);
            meta.put(META_SESSION_ID, s);
            meta.put(META_FILE_ID, fileId);
            meta.put(META_FILE_NAME, name);
            meta.put(META_PAGE, c.page);
            meta.put(META_CHUNK, currentChunkIdx);
            meta.put(META_VECTOR_ID, requestedVectorId);

            Document doc = createDocumentWithId(azureDocumentId, cleaned, meta);
            String actualVectorId = resolveDocumentId(doc, azureDocumentId);

            try {

                // add one-by-one so one blocked chunk does not fail whole upload
                vectorStore.add(List.of(doc));


                indexedCount++;
                indexedIds.add(actualVectorId);

                if (verifyProbeText == null) {
                    verifyProbeText = cleaned.length() > 250 ? cleaned.substring(0, 250) : cleaned;
                }
            } catch (Exception e) {

                if (isAzureContentFilter(e)) {
                    filteredByAzure++;
                } else {
                    throw e;
                }
            }
        }

        if (indexedCount == 0) {
            throw new IllegalStateException(
                    "Unable to index this file. All chunks were empty, unsafe, or blocked by Azure content filtering."
            );
        }

        // store only successfully indexed ids
        writeStoredIds(u, s, indexedIds);


        // verify inside same tenant - best effort only
        try {
            Filter.Expression verifyFilter = buildTenantFilter(u, s, List.of(fileId));
            List<Document> verify = vectorStore.similaritySearch(
                    SearchRequest.builder()
                            .query(verifyProbeText == null ? "the" : verifyProbeText)
                            .topK(1)
                            .similarityThreshold(SearchRequest.SIMILARITY_THRESHOLD_ACCEPT_ALL)
                            .filterExpression(verifyFilter)
                            .build()
            );


            if (verify.isEmpty()) {
            }
        } catch (Exception e) {
        }

        return indexedCount;
    }

    // Backward-compatible overload
    public int indexFile(String sessionId, String fileId, String fileName, Path filePath) throws Exception {
        return indexFile("unknown-user", sessionId, fileId, fileName, filePath);
    }

    // ---------------------------
    // SEARCH
    // ---------------------------
    public List<Document> search(String userId, String sessionId, List<String> fileIds, String query, int topK) {
        String u = uid(userId);
        String s = sid(sessionId);

        if (u.isBlank() || s.isBlank()) return List.of();

        List<String> fids = (fileIds == null) ? List.of() : fileIds.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(x -> !x.isBlank())
                .distinct()
                .toList();

        if (fids.isEmpty()) return List.of();

        String q = (query == null || query.isBlank()) ? "the" : query.trim();
        int k = Math.max(1, Math.min(topK <= 0 ? 6 : topK, 12));

        Filter.Expression filter = buildTenantFilter(u, s, fids);

        try {
            return vectorStore.similaritySearch(
                    SearchRequest.builder()
                            .query(q)
                            .topK(k)
                            .similarityThreshold(SearchRequest.SIMILARITY_THRESHOLD_ACCEPT_ALL)
                            .filterExpression(filter)
                            .build()
            );
        } catch (Exception e) {
            return List.of();
        }
    }

    // Backward-compatible overload
    public List<Document> search(String sessionId, List<String> fileIds, String query, int topK) {
        return search("unknown-user", sessionId, fileIds, query, topK);
    }

    private Filter.Expression buildTenantFilter(String userId, String sessionId, List<String> fileIds) {
        FilterExpressionBuilder b = new FilterExpressionBuilder();

        String[] fileIdArr = (fileIds == null ? new String[0] : fileIds.toArray(new String[0]));

        var base = b.and(
                b.and(
                        b.eq(META_SOURCE, SOURCE_VALUE),
                        b.eq(META_USER_ID, userId)
                ),
                b.eq(META_SESSION_ID, sessionId)
        );

        return b.and(
                base,
                b.in(META_FILE_ID, fileIdArr)
        ).build();
    }

    // ===========================
    // Delete helpers
    // ===========================
    private void deleteByIds(List<String> ids) throws Exception {
        List<String> cleaned = (ids == null ? List.<String>of() : ids.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(x -> !x.isBlank())
                .map(this::normalizeStoredDocumentId)
                .distinct()
                .toList());

        if (cleaned.isEmpty()) {
            return;
        }

        // Keep reflection for compatibility across Spring AI versions
        try {
            Method m = vectorStore.getClass().getMethod("delete", List.class);
            m.invoke(vectorStore, cleaned);
            return;
        } catch (NoSuchMethodException ignore) {
        }

        try {
            Method m = vectorStore.getClass().getMethod("delete", String[].class);
            m.invoke(vectorStore, (Object) cleaned.toArray(new String[0]));
            return;
        } catch (NoSuchMethodException ignore) {
        }

        throw new IllegalStateException("VectorStore has no delete(ids) method in this version.");
    }

    // ===========================
    // ID persistence
    // ===========================
    private List<String> readStoredIds(String userId, String sessionId) throws Exception {
        Path f = idsFile(userId, sessionId);
        if (!Files.exists(f)) return List.of();

        return Files.readAllLines(f, StandardCharsets.UTF_8).stream()
                .map(String::trim)
                .filter(x -> !x.isBlank())
                .map(this::normalizeStoredDocumentId)
                .distinct()
                .toList();
    }

    private void writeStoredIds(String userId, String sessionId, List<String> newIds) throws Exception {
        Path dir = sessionDir(userId, sessionId);
        Files.createDirectories(dir);

        Path f = idsFile(userId, sessionId);

        // keep merge behavior so multiple files in same session are supported
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        if (Files.exists(f)) {
            for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
                String x = (line == null) ? "" : line.trim();
                if (!x.isBlank()) merged.add(x);
            }
        }
        if (newIds != null) {
            for (String id : newIds) {
                if (id != null && !id.isBlank()) merged.add(id.trim());
            }
        }

        Files.write(
                f,
                merged.stream().toList(),
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING
        );

    }

    private void deleteDirectoryRecursively(Path dir) throws Exception {
        if (!Files.exists(dir)) return;
        try (var walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (Exception ignore) {
                }
            });
        }
    }

    // ===========================
    // Create Document with explicit id
    // ===========================
    private Document createDocumentWithId(String id, String text, Map<String, Object> meta) {
        try {
            Constructor<?> c = Document.class.getConstructor(String.class, String.class, Map.class);
            return (Document) c.newInstance(id, text, meta);
        } catch (Exception ignore) {
        }

        Document d = new Document(text, meta);

        try {
            Method m = d.getClass().getMethod("setId", String.class);
            m.invoke(d, id);
            return d;
        } catch (Exception ignore) {
        }

        try {
            Field f = d.getClass().getDeclaredField("id");
            f.setAccessible(true);
            f.set(d, id);
        } catch (Exception ignore) {
        }

        return d;
    }


    private String normalizeStoredDocumentId(String id) {
        if (id == null || id.isBlank()) {
            return "";
        }

        String trimmed = id.trim();
        if (trimmed.matches("[A-Za-z0-9_=-]+")) {
            return trimmed;
        }

        return azureSearchDocumentKey(trimmed);
    }

    private String azureSearchDocumentKey(String rawId) {
        String value = rawId == null ? UUID.randomUUID().toString() : rawId;
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private String resolveDocumentId(Document document, String fallback) {
        if (document == null) return fallback;

        try {
            Method m = document.getClass().getMethod("getId");
            Object value = m.invoke(document);
            if (value instanceof String s && !s.isBlank()) {
                return s.trim();
            }
        } catch (Exception ignore) {
        }

        try {
            Field f = document.getClass().getDeclaredField("id");
            f.setAccessible(true);
            Object value = f.get(document);
            if (value instanceof String s && !s.isBlank()) {
                return s.trim();
            }
        } catch (Exception ignore) {
        }

        return fallback;
    }

    private String rootMsg(Throwable e) {
        if (e == null) return "(null throwable)";

        Throwable original = e;
        Throwable t = e;

        if (e instanceof InvocationTargetException ite && ite.getTargetException() != null) {
            t = ite.getTargetException();
        }

        while (t.getCause() != null) {
            t = t.getCause();
        }

        String originalMsg = original.getClass().getName() + ": "
                + (original.getMessage() == null ? "(null)" : original.getMessage());
        String rootMsg = t.getClass().getName() + ": "
                + (t.getMessage() == null ? "(null)" : t.getMessage());

        if (original == t) return rootMsg;
        return originalMsg + " | rootCause=" + rootMsg;
    }

    private boolean isAzureContentFilter(Throwable e) {
        Throwable t = e;
        while (t != null) {
            String msg = Optional.ofNullable(t.getMessage()).orElse("").toLowerCase(Locale.ROOT);

            if (msg.contains("\"code\":\"content_filter\"")
                    || msg.contains("\"code\": \"content_filter\"")
                    || msg.contains("responsibleaipolicyviolation")
                    || msg.matches("(?s).*\\bcontent_filter\\b.*")) {
                return true;
            }

            t = t.getCause();
        }
        return false;
    }

    // ===========================
    // Sanitization / safety
    // ===========================
    private String sanitizeForIndexing(String text) {
        if (text == null) return "";

        String s = text.replace("\u0000", " ").replace("\r", "\n");
        String[] lines = s.split("\\R");
        StringBuilder out = new StringBuilder();

        for (String line : lines) {
            String l = line == null ? "" : line.trim();
            if (l.isBlank()) continue;

            String ll = l.toLowerCase(Locale.ROOT);

            // Drop common prompt-injection / jailbreak style lines
            if (ll.contains("ignore previous instructions")
                    || ll.contains("ignore all previous instructions")
                    || ll.contains("disregard previous instructions")
                    || ll.contains("forget previous instructions")
                    || ll.contains("forget all previous instructions")
                    || ll.contains("override previous instructions")
                    || ll.contains("system prompt")
                    || ll.contains("developer message")
                    || ll.contains("prompt injection")
                    || ll.contains("simulate developer mode")
                    || ll.contains("do anything now")
                    || ll.contains("bypass")
                    || ll.contains("jailbreak")
                    || ll.contains("you are chatgpt")
                    || ll.startsWith("system:")
                    || ll.startsWith("developer:")
                    || ll.startsWith("assistant:")
                    || ll.startsWith("user:")) {
                continue;
            }

            out.append(l).append('\n');

            // hard cap per chunk
            if (out.length() >= 3500) break;
        }

        return out.toString().trim();
    }

    private boolean shouldSkipChunk(String cleanedText) {
        if (cleanedText == null || cleanedText.isBlank()) return true;

        String x = cleanedText.toLowerCase(Locale.ROOT);

        // If dangerous patterns remain even after line sanitization, skip whole chunk
        return x.contains("ignore previous instructions")
                || x.contains("ignore all previous instructions")
                || x.contains("disregard previous instructions")
                || x.contains("forget previous instructions")
                || x.contains("override instructions")
                || x.contains("system prompt")
                || x.contains("developer message")
                || x.contains("prompt injection")
                || x.contains("simulate developer mode")
                || x.contains("do anything now")
                || x.contains("bypass safety")
                || x.contains("bypass policy")
                || x.contains("jailbreak");
    }

    // ===========================
    // EXTRACT + CHUNK
    // ===========================
    private List<Chunk> extractPdfChunks(Path pdfPath) throws Exception {
        List<Chunk> out = new ArrayList<>();
        try (PDDocument doc = Loader.loadPDF(pdfPath.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            int pages = doc.getNumberOfPages();

            for (int p = 1; p <= pages; p++) {
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                String pageText = Optional.ofNullable(stripper.getText(doc)).orElse("").trim();
                if (pageText.isEmpty()) continue;

                for (String part : chunk(pageText, 900, 120)) {
                    out.add(new Chunk(part, p));
                }
            }
        }
        return out;
    }

    private List<Chunk> extractDocxChunks(Path docxPath) throws Exception {
        try (InputStream in = Files.newInputStream(docxPath);
             XWPFDocument doc = new XWPFDocument(in)) {

            StringBuilder sb = new StringBuilder();
            doc.getParagraphs().forEach(p -> {
                String t = p.getText();
                if (t != null && !t.isBlank()) sb.append(t).append("\n");
            });

            String text = sb.toString().trim();
            if (text.isEmpty()) return List.of();

            List<Chunk> out = new ArrayList<>();
            for (String part : chunk(text, 900, 120)) {
                out.add(new Chunk(part, 1));
            }
            return out;
        }
    }

    private List<Chunk> extractTextChunks(Path textPath) throws Exception {
        String text = Files.readString(textPath, StandardCharsets.UTF_8).trim();
        if (text.isEmpty()) return List.of();

        List<Chunk> out = new ArrayList<>();
        for (String part : chunk(text, 900, 120)) {
            out.add(new Chunk(part, 1));
        }
        return out;
    }

    private List<String> chunk(String text, int size, int overlap) {
        if (text == null) return List.of();

        String t = text.replace("\r", " ").trim();
        if (t.isBlank()) return List.of();

        int chunkSize = Math.max(200, size);
        int ov = Math.max(0, Math.min(overlap, chunkSize - 50));

        List<String> out = new ArrayList<>();
        int i = 0;

        while (i < t.length()) {
            int end = Math.min(t.length(), i + chunkSize);
            String c = t.substring(i, end).trim();
            if (!c.isEmpty()) out.add(c);

            if (end == t.length()) break;
            i = Math.max(0, end - ov);
        }

        return out;
    }

    private static class Chunk {
        final String text;
        final int page;

        Chunk(String text, int page) {
            this.text = text;
            this.page = page;
        }
    }
}
