package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.IssueDetailsResponse;
import com.nathcorp.QAPortal.service.FetchIssueDetailsService;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/issues")
public class IssueController {

    private final FetchIssueDetailsService issueService;

    public IssueController(
            FetchIssueDetailsService issueService
    ) {
        this.issueService = issueService;
    }

    @GetMapping
    public ResponseEntity<IssueDetailsResponse> getIssues(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam(required = false) String tagName,

            @RequestParam(required = false) String buildName
    ) {

        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(
                issueService.getIssueDetails(
                        authorizationHeader,
                        organization,
                        project,
                        tagName,
                        buildName
                )
        );
    }

    private void validateAuthorization(String authorizationHeader) {
        AuthorizationUtils.requireBearerAuthorization(authorizationHeader);
    }
}