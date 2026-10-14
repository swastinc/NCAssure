package com.nathcorp.QAPortal.dto;

public class PieChartTestExecutionSummaryDto {
    private Integer testCaseId;
    private String outcome;

    public PieChartTestExecutionSummaryDto(Integer testCaseId, String outcome) {
        this.testCaseId = testCaseId;
        this.outcome = outcome;
    }

    public Integer getTestCaseId() { return testCaseId; }
    public String getOutcome() { return outcome; }
}