package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public class BugFeatureLabelingResult {

    @JsonProperty(required = true)
    private List<Item> items;

    public static class Item {
        @JsonProperty(required = true)
        private int workItemId;

        @JsonProperty(required = true)
        private String feature;

        public int getWorkItemId() { return workItemId; }
        public void setWorkItemId(int workItemId) { this.workItemId = workItemId; }

        public String getFeature() { return feature; }
        public void setFeature(String feature) { this.feature = feature; }
    }

    public List<Item> getItems() { return items; }
    public void setItems(List<Item> items) { this.items = items; }
}
