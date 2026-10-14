package com.nathcorp.QAPortal.dto;

import java.util.List;

public class DailyBugStatsResponse {

    private List<DailyCount> value;

    public List<DailyCount> getValue() {
        return value;
    }

    public void setValue(List<DailyCount> value) {
        this.value = value;
    }

    public static class DailyCount {
        private String date;
        private long createdCount;
        private long resolvedCount;
        private long closedCount;

        public String getDate() {
            return date;
        }

        public void setDate(String date) {
            this.date = date;
        }

        public long getCreatedCount() {
            return createdCount;
        }

        public void setCreatedCount(long createdCount) {
            this.createdCount = createdCount;
        }

        public long getResolvedCount() {
            return resolvedCount;
        }

        public void setResolvedCount(long resolvedCount) {
            this.resolvedCount = resolvedCount;
        }

        public long getClosedCount() {
            return closedCount;
        }

        public void setClosedCount(long closedCount) {
            this.closedCount = closedCount;
        }
    }
}