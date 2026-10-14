// src/main/java/com/nathcorp/QAPortal/dto/ai/BugFeatureSummaryResponse.java
package com.nathcorp.QAPortal.dto;

import java.util.List;
import java.util.Map;

public class BugFeatureSummaryResponse {

    private int totalBugs;
    private List<FeatureCount> featureCounts;

    // Keep name as aiSummary (so frontend doesn't break), but content is "AI Insights"
    private String aiSummary;

    // ✅ NEW: Top 5 bugs per feature label
    // JSON shape:
    // "topBugsByFeature": {
    //   "Pie Chart": [ { "workItemId": 123, "title": "..." }, ... ],
    //   "General":   [ ... ]
    // }
    private Map<String, List<TopBug>> topBugsByFeature;

    public static class FeatureCount {
        private String feature;
        private int count;

        public FeatureCount() {}
        public FeatureCount(String feature, int count) {
            this.feature = feature;
            this.count = count;
        }

        public String getFeature() { return feature; }
        public void setFeature(String feature) { this.feature = feature; }

        public int getCount() { return count; }
        public void setCount(int count) { this.count = count; }
    }

    public static class TopBug {
        private int workItemId;
        private String title;
        private String assignedTo;

        public TopBug() {
        }

        public TopBug(int workItemId, String title, String assignedTo) {
            this.workItemId = workItemId;
            this.title = title;
            this.assignedTo = assignedTo;
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

        public String getAssignedTo() {
            return assignedTo;
        }

        public void setAssignedTo(String assignedTo) {
            this.assignedTo = assignedTo;
        }
    }

    public BugFeatureSummaryResponse() {}

    // ✅ Keep your old constructor for compatibility
    public BugFeatureSummaryResponse(int totalBugs,
                                     List<FeatureCount> featureCounts,
                                     String aiSummary) {
        this.totalBugs = totalBugs;
        this.featureCounts = featureCounts;
        this.aiSummary = aiSummary;
    }

    // ✅ New constructor with top bugs
    public BugFeatureSummaryResponse(int totalBugs,
                                     List<FeatureCount> featureCounts,
                                     String aiSummary,
                                     Map<String, List<TopBug>> topBugsByFeature) {
        this.totalBugs = totalBugs;
        this.featureCounts = featureCounts;
        this.aiSummary = aiSummary;
        this.topBugsByFeature = topBugsByFeature;
    }

    public int getTotalBugs() { return totalBugs; }
    public void setTotalBugs(int totalBugs) { this.totalBugs = totalBugs; }

    public List<FeatureCount> getFeatureCounts() { return featureCounts; }
    public void setFeatureCounts(List<FeatureCount> featureCounts) { this.featureCounts = featureCounts; }

    public String getAiSummary() { return aiSummary; }
    public void setAiSummary(String aiSummary) { this.aiSummary = aiSummary; }

    public Map<String, List<TopBug>> getTopBugsByFeature() { return topBugsByFeature; }
    public void setTopBugsByFeature(Map<String, List<TopBug>> topBugsByFeature) { this.topBugsByFeature = topBugsByFeature; }
}
