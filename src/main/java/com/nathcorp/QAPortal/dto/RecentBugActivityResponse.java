package com.nathcorp.QAPortal.dto;

import java.time.OffsetDateTime;

public class RecentBugActivityResponse {

    private int workItemId;
    private String title;
    private String state;
    private OffsetDateTime changedDate;
    private String assignedTo;

    public RecentBugActivityResponse() {
    }

    public int getWorkItemId() {
        return workItemId;
    }

    public void setWorkItemId(int workItemId) {
        this.workItemId = workItemId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public OffsetDateTime getChangedDate() {
        return changedDate;
    }

    public void setChangedDate(OffsetDateTime changedDate) {
        this.changedDate = changedDate;
    }

    public String getAssignedTo() {
        return assignedTo;
    }

    public void setAssignedTo(String assignedTo) {
        this.assignedTo = assignedTo;
    }
}
