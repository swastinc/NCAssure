package com.nathcorp.QAPortal.dto;

public class WorkItem {
    private Integer workItemId;
    private String title;
    private String state;
    private String createdDate;
    private String resolvedDate;

    public Integer getWorkItemId() { return workItemId; }
    public void setWorkItemId(Integer workItemId) { this.workItemId = workItemId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getCreatedDate() { return createdDate; }
    public void setCreatedDate(String createdDate) { this.createdDate = createdDate; }

    public String getResolvedDate() { return resolvedDate; }
    public void setResolvedDate(String resolvedDate) { this.resolvedDate = resolvedDate; }
}
