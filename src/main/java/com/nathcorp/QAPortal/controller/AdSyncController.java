package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.AdSyncResponse;
import com.nathcorp.QAPortal.service.AdSyncService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/ad-sync")
public class AdSyncController {

    private final AdSyncService adSyncService;

    @Value("${azure.ad.group-id}")
    private String groupId;

    public AdSyncController(AdSyncService adSyncService) {
        this.adSyncService = adSyncService;
    }

    @PostMapping("/sync-group-users")
    public ResponseEntity<AdSyncResponse> syncGroupUsers(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authorizationHeader,
            @RequestHeader(value = "X-Graph-Access-Token", required = false)
            String graphAccessToken

    ) {


        if (!StringUtils.hasText(groupId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "groupId is required."
            );
        }

        if (!StringUtils.hasText(graphAccessToken)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Microsoft Graph access token is missing. Pass it in X-Graph-Access-Token header."
            );
        }

        AdSyncResponse response =
                adSyncService.syncUsersFromAdGroup(
                        graphAccessToken,
                        groupId
                );

        return ResponseEntity.ok(response);
    }
}