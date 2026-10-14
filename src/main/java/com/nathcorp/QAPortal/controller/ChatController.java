// src/main/java/com/nathcorp/QAPortal/controller/ChatController.java
package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.config.CurrentUserTokenStore;
import com.nathcorp.QAPortal.dto.ChatRequest;
import com.nathcorp.QAPortal.dto.UploadResponse;
import com.nathcorp.QAPortal.service.ChatAgentService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatAgentService chatAgentService;
    private final OboTokenService tokenStore;
    private final CurrentUserTokenStore currentUserTokenStore;

    public ChatController(
            ChatAgentService chatAgentService,
            OboTokenService tokenStore,
            CurrentUserTokenStore currentUserTokenStore
    ) {
        this.chatAgentService = chatAgentService;
        this.tokenStore = tokenStore;
        this.currentUserTokenStore = currentUserTokenStore;
    }

    @PostMapping
    public Map<String, Object> chat(
            @RequestBody ChatRequest body,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
            @RequestHeader(value = "X-Authorization", required = false) String xAuthorizationHeader,
            @RequestHeader(value = "X-Access-Token", required = false) String xAccessToken
    ) {
        String validAuthorizationHeader = validateAuthorization(
                resolveAuthorizationHeader(
                        authorizationHeader,
                        xAuthorizationHeader,
                        xAccessToken,
                        body
                )
        );

        String answer = chatAgentService.ask(
                body.getSessionId(),
                body.getMessage(),
                body.getRole(),
                body.getFileIds() == null ? List.of() : body.getFileIds(),
                validAuthorizationHeader
        );
        return Map.of("type", "TEXT", "text", answer);
    }

     @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadResponse upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("sessionId") String sessionId
    ) throws Exception {
        return chatAgentService.uploadAndIndex(sessionId, file);
    }

    private String validateAuthorization(String authorizationHeader) {
        return tokenStore.requireBackendOrAdoAuthorizationHeader(authorizationHeader);
    }

    private String resolveAuthorizationHeader(
            String authorizationHeader,
            String xAuthorizationHeader,
            String xAccessToken,
            ChatRequest body
    ) {
        String resolved = firstNonBlank(
                authorizationHeader,
                xAuthorizationHeader,
                xAccessToken,
                body != null ? body.getAuthorizationHeader() : null,
                body != null ? body.getAuthorization() : null,
                body != null ? body.getAccessToken() : null,
                body != null ? body.getToken() : null,
                getSavedAdoToken()
        );

        return normalizeBearerAuthorization(resolved);
    }

    private String getSavedAdoToken() {
        try {
            return currentUserTokenStore.getAdoToken();
        } catch (Exception ex) {
            return null;
        }
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }

        return null;
    }

    private String normalizeBearerAuthorization(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }

        String trimmed = value.trim();

        if (trimmed.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return trimmed;
        }

        return "Bearer " + trimmed;
    }
}
