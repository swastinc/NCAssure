package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class TestPointValue {

    @JsonProperty("LastResultOutcome")
    private String lastResultOutcome;
    @JsonProperty("TestCaseId")
    private int testCaseId;
    @JsonProperty("TestCase")
    private TestCaseInfo testCase;

    public String getLastResultOutcome() {
        return lastResultOutcome;
    }

    public void setLastResultOutcome(String lastResultOutcome) {
        this.lastResultOutcome = lastResultOutcome;
    }

    public int getTestCaseId() {
        return testCaseId;
    }

    public void setTestCaseId(int testCaseId) {
        this.testCaseId = testCaseId;
    }

    public TestCaseInfo getTestCase() {
        return testCase;
    }

    public void setTestCase(TestCaseInfo testCase) {
        this.testCase = testCase;
    }
}
