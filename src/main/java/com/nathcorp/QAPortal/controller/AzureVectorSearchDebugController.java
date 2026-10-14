// src/main/java/com/nathcorp/QAPortal/controller/AzureVectorSearchDebugController.java
package com.nathcorp.QAPortal.controller;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/chat/debug")
public class AzureVectorSearchDebugController {

    private final VectorStore vectorStore;

    @Value("${spring.ai.vectorstore.azure.index-name:}")
    private String indexName;

    public AzureVectorSearchDebugController(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    // Does NOT write anything. Just checks if index has any vectors (raw query)
    @GetMapping("/status")
    public Map<String, Object> status() {
        List<Document> raw = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query("the")
                        .topK(3)
                        .similarityThreshold(SearchRequest.SIMILARITY_THRESHOLD_ACCEPT_ALL)
                        .build()
        );

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("vectorStoreImpl", vectorStore.getClass().getName());
        out.put("indexName", indexName);
        out.put("rawCount", raw.size());
        out.put("rawSampleMeta", raw.isEmpty() ? null : raw.get(0).getMetadata());
        return out;
    }

    // Writes ONE known vector and immediately queries it back (proves upsert works)
    @PostMapping("/smoke")
    public Map<String, Object> smoke(@RequestParam String sessionId) {
        String fileId = "debug-" + UUID.randomUUID();

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("source", "uploaded");
        meta.put("sessionId", sessionId);
        meta.put("fileId", fileId);
        meta.put("fileName", "debug-smoke.txt");
        meta.put("page", 1);
        meta.put("chunk", 0);
        meta.put("ts", Instant.now().toString());

        String text = "SMOKE_TEST: Azure AI Search upsert works. sessionId=" + sessionId + " fileId=" + fileId;

        vectorStore.add(List.of(new Document(text, meta)));

        // raw
        List<Document> raw = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query("SMOKE_TEST")
                        .topK(5)
                        .similarityThreshold(SearchRequest.SIMILARITY_THRESHOLD_ACCEPT_ALL)
                        .build()
        );

        // filtered
        String filter = "source == 'uploaded' && sessionId == '" + escape(sessionId) + "' && fileId IN ['" + escape(fileId) + "']";
        List<Document> filtered = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query("SMOKE_TEST")
                        .topK(5)
                        .similarityThreshold(SearchRequest.SIMILARITY_THRESHOLD_ACCEPT_ALL)
                        .filterExpression(filter)
                        .build()
        );

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("vectorStoreImpl", vectorStore.getClass().getName());
        out.put("indexName", indexName);
        out.put("fileId", fileId);
        out.put("rawCount", raw.size());
        out.put("filteredCount", filtered.size());
        out.put("filter", filter);
        out.put("rawSampleMeta", raw.isEmpty() ? null : raw.get(0).getMetadata());
        out.put("filteredSampleMeta", filtered.isEmpty() ? null : filtered.get(0).getMetadata());
        return out;
    }

    private String escape(String s) {
        return s.replace("\\", "\\\\").replace("'", "\\'");
    }
}
