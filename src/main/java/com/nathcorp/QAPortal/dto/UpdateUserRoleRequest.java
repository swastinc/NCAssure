package com.nathcorp.QAPortal.dto;

public class UpdateUserRoleRequest {

    private String email;
    private String role;

    public UpdateUserRoleRequest() {}

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }
}
