// src/main/java/com/nathcorp/QAPortal/debug/VectorStoreDebugController.java
package com.nathcorp.QAPortal.controller;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;

@RestController
public class VectorStoreDebugController {

    private final VectorStore vectorStore;

    public VectorStoreDebugController(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    @GetMapping("/api/debug/vectorstore/smoke")
    public Map<String, Object> smoke() {
        String token = "smoke-" + UUID.randomUUID();

        Document d = new Document(
                "This is a smoke test document. token=" + token,
                new HashMap<>(Map.of(
                        "type", "smoke",
                        "token", token
                ))
        );

        // 1) write
        vectorStore.add(List.of(d));

        // 2) read (accept all scores)
        List<Document> hits = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(token)
                        .topK(5)
                        .similarityThreshold(SearchRequest.SIMILARITY_THRESHOLD_ACCEPT_ALL)
                        .build()
        );

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("hitCount", hits.size());
        out.put("sampleMeta", hits.isEmpty() ? Map.of() : hits.get(0).getMetadata());
        out.put("sampleText", hits.isEmpty() ? "" : hits.get(0).getText());
        return out;
    }
}
