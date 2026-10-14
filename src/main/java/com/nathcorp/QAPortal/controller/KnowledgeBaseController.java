package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.KnowledgeBaseItem;
import com.nathcorp.QAPortal.service.ActivityLogService;
import com.nathcorp.QAPortal.service.KnowledgeBaseService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/knowledge-base")
public class KnowledgeBaseController {

    @Autowired
    private ActivityLogService logService;

    @Autowired
    private OboTokenService tokenStore;

    private final KnowledgeBaseService service;

    public KnowledgeBaseController(
            KnowledgeBaseService service
    ) {
        this.service = service;
    }

    // CREATE
    @PostMapping
    public ResponseEntity<KnowledgeBaseItem> create(

            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authorizationHeader,

            @RequestBody KnowledgeBaseItem item
    ) {
        validateAuthorization(authorizationHeader);

        String currentUserEmail =
                getCurrentUserEmail(authorizationHeader);

        String currentUserName =
                getCurrentUserName(authorizationHeader);

        KnowledgeBaseItem saved =
                service.create(item);

        logService.log(
                "KNOWLEDGE BASE CREATED",
                currentUserEmail,
                LocalDateTime.now()
                        + " KNOWLEDGE BASE CREATED"
                        + " | Title: " + saved.getTitle()
                        + " | By: " + currentUserName
        );

        return ResponseEntity.ok(saved);
    }

    // READ ALL
    @GetMapping
    public ResponseEntity<List<KnowledgeBaseItem>> getAll(

            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authorizationHeader
    ) {
        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(service.getAll());
    }

    // READ BY ID
    @GetMapping("/{id}")
    public ResponseEntity<KnowledgeBaseItem> getById(

            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authorizationHeader,

            @PathVariable String id
    ) {
        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(service.getById(id));
    }

    // UPDATE
    @PutMapping("/{id}")
    public ResponseEntity<KnowledgeBaseItem> update(

            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authorizationHeader,

            @PathVariable String id,

            @RequestBody KnowledgeBaseItem item
    ) {
        validateAuthorization(authorizationHeader);

        String currentUserEmail =
                getCurrentUserEmail(authorizationHeader);

        String currentUserName =
                getCurrentUserName(authorizationHeader);

        KnowledgeBaseItem updated =
                service.update(id, item);

        logService.log(
                "KNOWLEDGE BASE UPDATED",
                currentUserEmail,
                LocalDateTime.now()
                        + " KNOWLEDGE BASE UPDATED"
                        + " | Title: " + updated.getTitle()
                        + " | By: " + currentUserName
        );

        return ResponseEntity.ok(updated);
    }

    // DELETE
    @DeleteMapping("/{id}")
    public ResponseEntity<String> delete(

            @PathVariable String id,

            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authorizationHeader
    ) {
        validateAuthorization(authorizationHeader);

        String currentUserEmail =
                getCurrentUserEmail(authorizationHeader);

        String currentUserName =
                getCurrentUserName(authorizationHeader);

        KnowledgeBaseItem existing =
                service.getById(id);

        service.deleteById(id);

        logService.log(
                "KNOWLEDGE BASE DELETED",
                currentUserEmail,
                LocalDateTime.now()
                        + " KNOWLEDGE BASE DELETED"
                        + " | Title: " + existing.getTitle()
                        + " | By: " + currentUserName
        );

        return ResponseEntity.ok("Deleted");
    }

    /**
     * Validate Authorization Header + OBO Token
     */
    private void validateAuthorization(String authorizationHeader) {
        tokenStore.requireAuthorizationHeader(authorizationHeader);
    }

    private String getCurrentUserEmail(String authorizationHeader) {
        return tokenStore.getUserEmailOrFallback(authorizationHeader);
    }

    private String getCurrentUserName(String authorizationHeader) {
        return tokenStore.getUserNameOrFallback(authorizationHeader);
    }
}
