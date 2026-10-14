package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.ConfidenceScoreDTO;
import com.nathcorp.QAPortal.service.ConfidenceScoreService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/confidence")
public class ConfidenceScoreController {

    private final ConfidenceScoreService confidenceScoreService;

    private final OboTokenService tokenStore;

    public ConfidenceScoreController(
            ConfidenceScoreService confidenceScoreService,
            OboTokenService tokenStore
    ) {
        this.confidenceScoreService = confidenceScoreService;
        this.tokenStore = tokenStore;
    }

    @GetMapping("/calculate")
    public CompletableFuture<ResponseEntity<ConfidenceScoreDTO>>
    calculateConfidenceScore(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam(required = false)
            String tag,

            @RequestParam(required = false)
            String buildName
    ) {
        return confidenceScoreService
                .calculateConfidenceScore(
                        authorizationHeader,
                        organization,
                        project,
                        tag,
                        buildName
                )
                .thenApply(ResponseEntity::ok);
    }
}