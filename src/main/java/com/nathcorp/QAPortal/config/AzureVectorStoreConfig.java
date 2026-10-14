package com.nathcorp.QAPortal.config;

import com.azure.search.documents.indexes.SearchIndexClient;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.vectorstore.azure.AzureVectorStore;
import org.springframework.ai.vectorstore.azure.AzureVectorStore.MetadataField;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class AzureVectorStoreConfig {

    @Bean
    public AzureVectorStore vectorStore(
            SearchIndexClient searchIndexClient,
            EmbeddingModel embeddingModel,
            @Value("${spring.ai.vectorstore.azure.index-name:spring_ai_azure_vector_store}") String indexName,
            @Value("${spring.ai.vectorstore.azure.initialize-schema:false}") boolean initializeSchema
    ) {
        return AzureVectorStore.builder(searchIndexClient, embeddingModel)
                .indexName(indexName)
                .initializeSchema(initializeSchema)
                .filterMetadataFields(List.of(
                        MetadataField.text("source"),
                        MetadataField.text("doc_id"),
                        MetadataField.text("project"),
                        MetadataField.text("version"),
                        MetadataField.text("source_url"),
                        MetadataField.text("userId"),
                        MetadataField.text("sessionId"),
                        MetadataField.text("fileId"),
                        MetadataField.text("fileName"),
                        MetadataField.text("vectorId"),
                        MetadataField.int64("page"),
                        MetadataField.int64("chunk")
                ))
                .build();
    }
}