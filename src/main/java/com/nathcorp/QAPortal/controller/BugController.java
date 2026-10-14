package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.BugDetailsResponse;
import com.nathcorp.QAPortal.dto.BugFeatureSummaryResponse;
import com.nathcorp.QAPortal.service.ActivityLogService;
import com.nathcorp.QAPortal.service.FetchBugDetailsService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/bugs")
public class BugController {

    private final FetchBugDetailsService bugService;
    private final ActivityLogService logService;
    private final OboTokenService tokenStore;

    public BugController(
            FetchBugDetailsService bugService,
            ActivityLogService logService,
            OboTokenService tokenStore
    ) {
        this.bugService = bugService;
        this.logService = logService;
        this.tokenStore = tokenStore;
    }

    @GetMapping
    public ResponseEntity<BugDetailsResponse> getBugs(
            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam String buildName,

            @RequestParam(required = false) String tag
    ) {
        BugDetailsResponse response =
                bugService.getBugDetails(
                        authorizationHeader,
                        organization,
                        project,
                        tag,
                        buildName
                );

        return ResponseEntity.ok(response);
    }

    @GetMapping("/ai-trends")
    public ResponseEntity<BugFeatureSummaryResponse> getAiTrends(
            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam String buildName,

            @RequestParam(required = false) String tag
    ) {
        BugFeatureSummaryResponse response =
                bugService.getAiTrends(
                        authorizationHeader,
                        organization,
                        project,
                        tag,
                        buildName
                );

        return ResponseEntity.ok(response);
    }

    @GetMapping("/severity-count")
    public ResponseEntity<Map<String, Long>> getSeverity(
            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam String buildName,

            @RequestParam(required = false) String tagName,

            @RequestParam(required = false) String tag
    ) {
        String effectiveTag =
                tagName != null && !tagName.isBlank()
                        ? tagName
                        : tag;

        Map<String, Long> response =
                bugService.getSeverityCounts(
                        authorizationHeader,
                        organization,
                        project,
                        effectiveTag,
                        buildName
                );

        return ResponseEntity.ok(response);
    }
}