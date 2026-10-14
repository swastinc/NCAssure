package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class ChangedBy {

    @JsonProperty("UserName")
    private String userName;

    @JsonProperty("UserEmail")
    private String userEmail;

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public String getUserEmail() {
        return userEmail;
    }

    public void setUserEmail(String userEmail) {
        this.userEmail = userEmail;
    }
}
