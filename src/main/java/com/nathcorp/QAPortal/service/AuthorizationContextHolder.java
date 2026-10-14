package com.nathcorp.QAPortal.service;

import org.springframework.stereotype.Component;

@Component
public class AuthorizationContextHolder {

    private static final ThreadLocal<String> AUTHORIZATION = new ThreadLocal<>();

    public void setAuthorizationHeader(String authorizationHeader) {
        AUTHORIZATION.set(authorizationHeader);
    }

    public String getAuthorizationHeader() {
        return AUTHORIZATION.get();
    }

    public void clear() {
        AUTHORIZATION.remove();
    }
}
