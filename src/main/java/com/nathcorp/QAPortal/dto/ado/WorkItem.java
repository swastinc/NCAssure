package com.nathcorp.QAPortal.dto.ado;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public class WorkItem {

    @JsonProperty("WorkItemId")
    private Integer workItemId;

    @JsonProperty("Title")
    private String title;

    @JsonProperty("WorkItemType")
    private String workItemType;

    @JsonProperty("State")
    private String state;

    @JsonProperty("Tags")
    private List<WorkItemTag> tags;

    public WorkItem() {
    }

    public Integer getWorkItemId() {
        return workItemId;
    }

    public void setWorkItemId(Integer workItemId) {
        this.workItemId = workItemId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getWorkItemType() {
        return workItemType;
    }

    public void setWorkItemType(String workItemType) {
        this.workItemType = workItemType;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public List<WorkItemTag> getTags() {
        return tags;
    }

    public void setTags(List<WorkItemTag> tags) {
        this.tags = tags;
    }
}
