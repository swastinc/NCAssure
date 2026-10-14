package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.DailyBugStatsResponse;
import com.nathcorp.QAPortal.service.BugAnalyticsService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/bugStats")
public class BugAnalyticsController {

    private final BugAnalyticsService service;
    private final OboTokenService tokenStore;

    public BugAnalyticsController(
            BugAnalyticsService service,
            OboTokenService tokenStore
    ) {
        this.service = service;
        this.tokenStore = tokenStore;
    }

    @GetMapping
    public ResponseEntity<DailyBugStatsResponse> getStats(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam String startDate,

            @RequestParam String endDate,

            @RequestParam String tagName
    ) {
        DailyBugStatsResponse response =
                service.getDailyBugStats(
                        authorizationHeader,
                        organization,
                        project,
                        startDate,
                        endDate,
                        tagName
                );


        return ResponseEntity.ok(response);
    }
}
