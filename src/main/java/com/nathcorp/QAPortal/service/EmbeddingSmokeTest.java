package com.nathcorp.QAPortal.service;

import jakarta.annotation.PostConstruct;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Profile("!test")
public class EmbeddingSmokeTest {

    private final EmbeddingModel embeddingModel;

    public EmbeddingSmokeTest(EmbeddingModel embeddingModel) {
        this.embeddingModel = embeddingModel;
    }

    @PostConstruct
    public void testEmbedding() {
        try {
            var res = embeddingModel.embedForResponse(List.of("hello world"));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
