package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.OffsetDateTime;

public class TestExecutionDto {

    private Integer testCaseId;
    private String outcome;
    private String testCaseTitle;
    private OffsetDateTime completedDate;
    private String runBy;

    @JsonProperty("testCase")
    private void unpackTestCase(TestCaseRef tc) {
        if (tc != null) {
            this.testCaseId = tc.getId();
            this.testCaseTitle = tc.getName();
        }
    }

    public void setTestCaseId(Integer testCaseId) {
        this.testCaseId = testCaseId;
    }

    public void setOutcome(String outcome) {
        this.outcome = outcome;
    }

    public void setTestCaseTitle(String testCaseTitle) {
        this.testCaseTitle = testCaseTitle;
    }

    public void setCompletedDate(OffsetDateTime completedDate) {
        this.completedDate = completedDate;
    }

    public void setRunBy(String runBy) {
        this.runBy = runBy;
    }

    public Integer getTestCaseId() { return testCaseId; }
    public String getOutcome() { return outcome; }
    public OffsetDateTime getCompletedDate() { return completedDate; }
    public String getTestCaseTitle() { return testCaseTitle; }

    public String getRunBy() { return runBy;  }



}
