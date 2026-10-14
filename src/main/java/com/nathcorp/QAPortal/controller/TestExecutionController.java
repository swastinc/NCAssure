package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.ProgressResponse;
import com.nathcorp.QAPortal.service.AzureTestExecutionService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/testProgress")
public class TestExecutionController {

    private final AzureTestExecutionService service;
    private final OboTokenService tokenStore;

    public TestExecutionController(
            AzureTestExecutionService service,
            OboTokenService tokenStore
    ) {
        this.service = service;
        this.tokenStore = tokenStore;
    }

    @GetMapping
    public ResponseEntity<ProgressResponse> getProgress(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam(value = "tag", required = false)
            String tag,

            @RequestParam(value = "tagName", required = false)
            String tagName,

            @RequestParam(value = "buildName", required = false)
            String buildName
    ) {
        if (!StringUtils.hasText(organization)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "organization is required"
            );
        }

        if (!StringUtils.hasText(project)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "project is required"
            );
        }

        String releaseTag =
                StringUtils.hasText(tag)
                        ? tag
                        : tagName;

        if (!StringUtils.hasText(releaseTag)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "tag/releaseTag is required"
            );
        }

        if (!StringUtils.hasText(buildName)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "buildName is required"
            );
        }

        String safeOrganization = organization.trim();
        String safeProject = project.trim();
        String safeTag = releaseTag.trim();
        String safeBuildName = buildName.trim();

        ProgressResponse response =
                service.calculateProgress(
                        authorizationHeader,
                        safeOrganization,
                        safeProject,
                        safeTag,
                        safeBuildName
                );

        return ResponseEntity.ok(response);
    }
}