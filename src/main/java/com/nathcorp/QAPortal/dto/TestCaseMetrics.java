package com.nathcorp.QAPortal.dto;

public class TestCaseMetrics {

    private int total;
    private int executed;
    private int notApplicable;

    // ✅ Required by Jackson
    public TestCaseMetrics() {
    }

    // ✅ REQUIRED for your service usage
    public TestCaseMetrics(int total, int executed, int notApplicable) {
        this.total = total;
        this.executed = executed;
        this.notApplicable = notApplicable;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public int getExecuted() {
        return executed;
    }

    public void setExecuted(int executed) {
        this.executed = executed;
    }

    public int getNotApplicable() {
        return notApplicable;
    }

    public void setNotApplicable(int notApplicable) {
        this.notApplicable = notApplicable;
    }
}
