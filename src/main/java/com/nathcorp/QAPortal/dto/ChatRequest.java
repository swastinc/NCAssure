// src/main/java/com/nathcorp/QAPortal/dto/ChatRequest.java
package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class ChatRequest {
    private String message;
    private String sessionId;
    private String role;
    private List<String> fileIds;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String authorizationHeader;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String authorization;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String accessToken;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String token;

    public List<String> getFileIds() {
        return fileIds;
    }

    public void setFileIds(List<String> fileIds) {
        this.fileIds = fileIds;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public String getAuthorizationHeader() {
        return authorizationHeader;
    }

    public void setAuthorizationHeader(String authorizationHeader) {
        this.authorizationHeader = authorizationHeader;
    }

    public String getAuthorization() {
        return authorization;
    }

    public void setAuthorization(String authorization) {
        this.authorization = authorization;
    }

    public String getAccessToken() {
        return accessToken;
    }

    public void setAccessToken(String accessToken) {
        this.accessToken = accessToken;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
