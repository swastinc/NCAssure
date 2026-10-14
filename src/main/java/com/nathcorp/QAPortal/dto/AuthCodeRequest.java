package com.nathcorp.QAPortal.dto;

public class AuthCodeRequest {
    private String code;
    private String codeVerifier;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getCodeVerifier() { return codeVerifier; }
    public void setCodeVerifier(String codeVerifier) { this.codeVerifier = codeVerifier; }
}
