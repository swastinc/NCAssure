package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.CentralRepo;
import com.nathcorp.QAPortal.service.ActivityLogService;
import com.nathcorp.QAPortal.service.CentralRepoService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/centralrepo")
public class CentralRepoController {

    private final CentralRepoService service;
    private final ActivityLogService logService;
    private final OboTokenService tokenStore;

    public CentralRepoController(
            CentralRepoService service,
            ActivityLogService logService,
            OboTokenService tokenStore
    ) {
        this.service = service;
        this.logService = logService;
        this.tokenStore = tokenStore;
    }

    @PostMapping
    public ResponseEntity<CentralRepo> updateCentralRepo(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestBody CentralRepo repo
    ) {

        validateAuthorization(authorizationHeader);

        String currentUserEmail =
                getCurrentUserEmail(authorizationHeader);

        String currentUserName =
                getCurrentUserName(authorizationHeader);

        if (repo == null
                || !StringUtils.hasText(repo.getProjectName())) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "projectName is required"
            );
        }

        String projectName =
                repo.getProjectName().trim();

        CentralRepo existing =
                service.getCentralRepo(projectName);

        CentralRepo saved;

        // CREATE
        if (existing == null) {

            CentralRepo created = new CentralRepo();

            created.setId(UUID.randomUUID().toString());

            created.setProjectName(projectName);

            created.setTestCasesTitle(trim(repo.getTestCasesTitle()));
            created.setTestCasesLink(trim(repo.getTestCasesLink()));

            created.setDefectsTitle(trim(repo.getDefectsTitle()));
            created.setDefectsLink(trim(repo.getDefectsLink()));

            created.setReportsTitle(trim(repo.getReportsTitle()));
            created.setReportsLink(trim(repo.getReportsLink()));

            saved = service.saveRepoEntry(created);

            logService.log(
                    "CENTRAL REPOSITORY CREATED",
                    currentUserEmail,
                    LocalDateTime.now()
                            + " CENTRAL REPOSITORY CREATED"
                            + " | Project: " + projectName
                            + " | By: " + currentUserName
            );

            return ResponseEntity.ok(saved);
        }

        // IMPORTANT FOR COSMOS DB
        // preserve existing id
        existing.setId(existing.getId());

        existing.setProjectName(projectName);

        existing.setTestCasesTitle(trim(repo.getTestCasesTitle()));
        existing.setTestCasesLink(trim(repo.getTestCasesLink()));

        existing.setDefectsTitle(trim(repo.getDefectsTitle()));
        existing.setDefectsLink(trim(repo.getDefectsLink()));

        existing.setReportsTitle(trim(repo.getReportsTitle()));
        existing.setReportsLink(trim(repo.getReportsLink()));

        saved = service.saveRepoEntry(existing);

        logService.log(
                "CENTRAL REPOSITORY UPDATED",
                currentUserEmail,
                LocalDateTime.now()
                        + " CENTRAL REPOSITORY UPDATED"
                        + " | Project: " + projectName
                        + " | By: " + currentUserName
        );

        return ResponseEntity.ok(saved);
    }

    @GetMapping
    public ResponseEntity<List<CentralRepo>> getAll(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(service.getAllRepos());
    }

    @GetMapping("/{projectName}")
    public ResponseEntity<CentralRepo> getByProject(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @PathVariable String projectName
    ) {

        validateAuthorization(authorizationHeader);

        if (!StringUtils.hasText(projectName)) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "projectName is required"
            );
        }

        CentralRepo existing =
                service.getCentralRepo(projectName.trim());

        if (existing == null) {
            return ResponseEntity.noContent().build();
        }

        return ResponseEntity.ok(existing);
    }

    /**
     * Common Authorization Validation
     */
    private void validateAuthorization(
            String authorizationHeader
    ) {
        tokenStore.requireAuthorizationHeader(authorizationHeader);
    }

    private String getCurrentUserEmail(String authorizationHeader) {
        return tokenStore.getUserEmailOrFallback(authorizationHeader);
    }

    private String getCurrentUserName(String authorizationHeader) {
        return tokenStore.getUserNameOrFallback(authorizationHeader);
    }

    private String trim(String value) {

        return value == null
                ? null
                : value.trim();
    }
}
