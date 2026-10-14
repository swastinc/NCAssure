package com.nathcorp.QAPortal.dto;

public class AdSyncResponse {

    private int totalUsersFetched;
    private int newUsersCreated;
    private int existingUsersUpdated;
    private String deltaLink;

    public int getTotalUsersFetched() {
        return totalUsersFetched;
    }

    public void setTotalUsersFetched(int totalUsersFetched) {
        this.totalUsersFetched = totalUsersFetched;
    }

    public int getNewUsersCreated() {
        return newUsersCreated;
    }

    public void setNewUsersCreated(int newUsersCreated) {
        this.newUsersCreated = newUsersCreated;
    }

    public int getExistingUsersUpdated() {
        return existingUsersUpdated;
    }

    public void setExistingUsersUpdated(int existingUsersUpdated) {
        this.existingUsersUpdated = existingUsersUpdated;
    }

    public String getDeltaLink() {
        return deltaLink;
    }

    public void setDeltaLink(String deltaLink) {
        this.deltaLink = deltaLink;
    }
}