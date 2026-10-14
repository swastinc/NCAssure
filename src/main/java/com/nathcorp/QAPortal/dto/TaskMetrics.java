package com.nathcorp.QAPortal.dto;

import java.util.LinkedHashMap;
import java.util.Map;

public class TaskMetrics {

    private int total;
    private Map<String, Integer> statusCounts = new LinkedHashMap<>();

    public TaskMetrics() {
    }

    public TaskMetrics(int total, Map<String, Integer> statusCounts) {
        this.total = total;
        this.statusCounts = statusCounts == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(statusCounts);
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public Map<String, Integer> getStatusCounts() {
        return statusCounts;
    }

    public void setStatusCounts(Map<String, Integer> statusCounts) {
        this.statusCounts = statusCounts == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(statusCounts);
    }
}