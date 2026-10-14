package com.nathcorp.QAPortal.service;

import com.azure.cosmos.implementation.NotFoundException;
import com.azure.cosmos.models.PartitionKey;
import com.nathcorp.QAPortal.dto.KnowledgeBaseItem;
import com.nathcorp.QAPortal.repository.KnowledgeBaseRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class KnowledgeBaseService {

    private final KnowledgeBaseRepository repository;

    public KnowledgeBaseService(KnowledgeBaseRepository repository) {
        this.repository = repository;
    }

    // CREATE
    public KnowledgeBaseItem create(KnowledgeBaseItem item) {
        if (item.getTitle() == null || item.getLink() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Title and Link are required");
        }
        return repository.save(item);
    }

    // READ - ALL
    public List<KnowledgeBaseItem> getAll() {
        List<KnowledgeBaseItem> items = new ArrayList<>();
        repository.findAll().forEach(items::add);
        return items;
    }

    // READ - BY ID
    public KnowledgeBaseItem getById(String id) {
        return repository.findById(id)
                .orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found"));
    }

    // UPDATE
    public KnowledgeBaseItem update(
            String id,
            KnowledgeBaseItem updated
    ) {

        KnowledgeBaseItem existing = getById(id);

        existing.setId(existing.getId());

        existing.setTitle(updated.getTitle());
        existing.setLink(updated.getLink());
        existing.setDescription(updated.getDescription());

        return repository.save(existing);
    }

    // DELETE
    public void deleteById(String id) {
        if (repository.findById(id).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found");
        }
        repository.deleteById(id);
    }



}
