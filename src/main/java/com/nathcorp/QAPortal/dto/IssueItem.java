package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class IssueItem {

    @JsonProperty("WorkItemId")
    private int workItemId;

    @JsonProperty("Title")

    private String title;

    @JsonProperty("State")

    private String state;

    @JsonProperty("ChangedDate")

    private String changedDate;

    @JsonProperty("AssignedTo")
    private UserInfo assignedTo;
    
    @JsonProperty("ChangedBy")

    private ChangedBy changedBy;
    
    @JsonProperty("Tags")
    private List<Tag> tags;


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

    public String getChangedDate() {
        return changedDate;
    }

    public void setChangedDate(String changedDate) {
        this.changedDate = changedDate;
    }

    public ChangedBy getChangedBy() {
        return changedBy;
    }

    public void setChangedBy(ChangedBy changedBy) {
        this.changedBy = changedBy;
    }

    public List<Tag> getTags() {
        return tags;
    }

    public void setTags(List<Tag> tags) {
        this.tags = tags;
    }

    public UserInfo getAssignedTo() {
        return assignedTo;
    }

    public void setAssignedTo(UserInfo assignedTo) {
        this.assignedTo = assignedTo;
    }

    public int getWorkItemId() {
        return workItemId;
    }

    public void setWorkItemId(int workItemId) {
        this.workItemId = workItemId;
    }
}
