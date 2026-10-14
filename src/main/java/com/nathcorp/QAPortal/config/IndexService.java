// src/main/java/com/nathcorp/QAPortal/config/IndexService.java
package com.nathcorp.QAPortal.config;

import org.apache.tika.Tika;
import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.*;

@Service
public class IndexService {

    private final VectorStore vectorStore;
    private final Tika tika = new Tika();

    public IndexService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public int index(Resource file, String docId) {
        if (file == null) throw new IllegalArgumentException("file is required");
        if (docId == null || docId.isBlank()) throw new IllegalArgumentException("docId is required");

        String fileName = safeFilename(file);

        // 1) Extract text (Apache Tika)
        String text = extractText(file);
        if (text == null || text.trim().length() < 20) {
            throw new IllegalStateException("No extractable text from file: " + fileName);
        }

        List<Document> docs = List.of(new Document(text, new HashMap<>(Map.of(
                "doc_id", docId,
                "source", fileName
        ))));

        // 2) Chunk
        TokenTextSplitter splitter = TokenTextSplitter.builder()
                .withChunkSize(800)
                .withMinChunkSizeChars(200)
                .withMinChunkLengthToEmbed(10)
                .withKeepSeparator(true)
                .build();

        List<Document> chunks = splitter.apply(docs);

        if (chunks == null || chunks.isEmpty()) {
            throw new IllegalStateException("Chunking produced 0 chunks for: " + fileName);
        }

        // 3) Metadata (crucial for filtering + traceability)
        for (int i = 0; i < chunks.size(); i++) {
            Map<String, Object> meta = chunks.get(i).getMetadata();
            if (meta == null) meta = new HashMap<>();

            meta.put("doc_id", docId);
            meta.put("chunk", i);
            meta.put("source", fileName);

            // ensure set back (safe even if getMetadata returns mutable)
            chunks.get(i).getMetadata().putAll(meta);
        }

        // 4) Upsert to Azure AI Search (embeddings done via Azure embedding deployment)
        vectorStore.add(chunks);

        return chunks.size();
    }

    private String extractText(Resource file) {
        try (InputStream in = file.getInputStream()) {
            // Tika can parse pdf/docx/xlsx/txt/etc.
            return tika.parseToString(in);
        } catch (Exception e) {
            throw new RuntimeException("Failed to extract text using Tika from resource: " + safeFilename(file), e);
        }
    }

    private String safeFilename(Resource file) {
        try {
            String fn = file.getFilename();
            return (fn == null || fn.isBlank()) ? "file" : fn;
        } catch (Exception e) {
            return "file";
        }
    }
}
