package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public class BugAnalyticsResponse {

    @JsonProperty("value")
    private List<BugItem> Value;

    public List<BugItem> getValue() {
        return Value;
    }

    public void setValue(List<BugItem> value) {
        this.Value = value;
    }

    public static class BugItem {

        @JsonProperty("WorkItemId")
        private Integer WorkItemId;

        @JsonProperty("CreatedDate")
        private String CreatedDate;

        @JsonProperty("ResolvedDate")
        private String ResolvedDate;

        @JsonProperty("ClosedDate")
        private String ClosedDate;

        @JsonProperty("Title")
        private String Title;

        @JsonProperty("State")
        private String State;

        public Integer getWorkItemId() {
            return WorkItemId;
        }

        public void setWorkItemId(Integer workItemId) {
            WorkItemId = workItemId;
        }

        public String getCreatedDate() {
            return CreatedDate;
        }

        public void setCreatedDate(String createdDate) {
            CreatedDate = createdDate;
        }

        public String getResolvedDate() {
            return ResolvedDate;
        }

        public void setResolvedDate(String resolvedDate) {
            ResolvedDate = resolvedDate;
        }

        public String getClosedDate() {
            return ClosedDate;
        }

        public void setClosedDate(String closedDate) {
            ClosedDate = closedDate;
        }

        public String getTitle() {
            return Title;
        }

        public void setTitle(String title) {
            Title = title;
        }

        public String getState() {
            return State;
        }

        public void setState(String state) {
            State = state;
        }

        @Override
        public String toString() {
            return "BugItem{" +
                    "WorkItemId=" + WorkItemId +
                    ", Title='" + Title + '\'' +
                    ", State='" + State + '\'' +
                    ", CreatedDate='" + CreatedDate + '\'' +
                    ", ResolvedDate='" + ResolvedDate + '\'' +
                    ", ClosedDate='" + ClosedDate + '\'' +
                    '}';
        }
    }
}