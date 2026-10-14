package com.nathcorp.QAPortal.components;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.concurrent.ConcurrentHashMap;

@Component
public class UserTokenStore {

    private static class SessionData {
        volatile String adoToken;
        volatile String graphToken;
        volatile String userEmail;
        volatile String userName;
    }

    private final ConcurrentHashMap<String, SessionData> store = new ConcurrentHashMap<>();

    private String sid(String sessionId) {
        return sessionId == null ? "" : sessionId.trim();
    }

    private String currentSessionId() {
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();

        if (attrs == null) {
            throw new IllegalStateException("No active request context found");
        }

        HttpServletRequest request = attrs.getRequest();
        HttpSession session = request.getSession(false);

        if (session == null) {
            throw new IllegalStateException("No active HTTP session found");
        }

        return session.getId();
    }

    private SessionData data(String sessionId) {
        String s = sid(sessionId);
        if (s.isBlank()) {
            throw new IllegalArgumentException("sessionId is required");
        }
        return store.computeIfAbsent(s, k -> new SessionData());
    }

    private SessionData currentData() {
        return data(currentSessionId());
    }

    // -------- per session methods --------

    public void saveAdoToken(String sessionId, String token) {
        data(sessionId).adoToken = token;
    }

    public String getAdoToken(String sessionId) {
        return data(sessionId).adoToken;
    }

    public void saveGraphToken(String sessionId, String token) {
        data(sessionId).graphToken = token;
    }

    public String getGraphToken(String sessionId) {
        return data(sessionId).graphToken;
    }

    public void setUserEmail(String sessionId, String userEmail) {
        data(sessionId).userEmail = userEmail;
    }

    public String getUserEmail(String sessionId) {
        return data(sessionId).userEmail;
    }

    public void setUserName(String sessionId, String userName) {
        data(sessionId).userName = userName;
    }

    public String getUserName(String sessionId) {
        return data(sessionId).userName;
    }

    public void clearSession(String sessionId) {
        String s = sid(sessionId);
        if (!s.isBlank()) {
            store.remove(s);
        }
    }

    // -------- current session methods --------
    // These are safe for multi-user as long as each browser has its own HTTP session.

    public void saveAdoToken(String token) {
        currentData().adoToken = token;
    }

    public String getAdoToken() {
        return currentData().adoToken;
    }

    public void saveGraphToken(String token) {
        currentData().graphToken = token;
    }

    public String getGraphToken() {
        return currentData().graphToken;
    }

    public void setUserEmail(String userEmail) {
        currentData().userEmail = userEmail;
    }

    public String getUserEmail() {
        return currentData().userEmail;
    }

    public void setUserName(String userName) {
        currentData().userName = userName;
    }

    public String getUserName() {
        return currentData().userName;
    }

    public void clearCurrentSession() {
        clearSession(currentSessionId());
    }
}