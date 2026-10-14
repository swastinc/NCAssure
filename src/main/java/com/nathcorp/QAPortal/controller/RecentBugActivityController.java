package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.RecentBugActivityResponse;
import com.nathcorp.QAPortal.service.OboTokenService;
import com.nathcorp.QAPortal.service.RecentBugActivityService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/recent-activity")
public class RecentBugActivityController {

    private final RecentBugActivityService service;
    private final OboTokenService tokenStore;

    public RecentBugActivityController(
            RecentBugActivityService service,
            OboTokenService tokenStore
    ) {
        this.service = service;
        this.tokenStore = tokenStore;
    }

    @GetMapping("/bugs")
    public ResponseEntity<List<RecentBugActivityResponse>> getRecentBugs(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project
    ) {
        return ResponseEntity.ok(
                service.getRecentBugActivity(
                        authorizationHeader,
                        organization,
                        project
                )
        );
    }
}
