package com.nathcorp.QAPortal.dto;

import java.time.OffsetDateTime;

public class WorkItemResponse {
    private int WorkItemId;
    private OffsetDateTime CreatedDate;
    private OffsetDateTime ResolvedDate;

    public int getWorkItemId() {
        return WorkItemId;
    }
    public void setWorkItemId(int workItemId) {
        WorkItemId = workItemId;
    }
    public OffsetDateTime getCreatedDate() {
        return CreatedDate;
    }
    public void setCreatedDate(OffsetDateTime createdDate) {
        CreatedDate = createdDate;
    }
    public OffsetDateTime getResolvedDate() {
        return ResolvedDate;
    }
    public void setResolvedDate(OffsetDateTime resolvedDate) {
        ResolvedDate = resolvedDate;
    }
}
