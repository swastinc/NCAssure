package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import com.nathcorp.QAPortal.dto.KnowledgeBaseItem;
import org.springframework.stereotype.Repository;

@Repository
public interface KnowledgeBaseRepository
        extends CosmosRepository<KnowledgeBaseItem, String> {
}
