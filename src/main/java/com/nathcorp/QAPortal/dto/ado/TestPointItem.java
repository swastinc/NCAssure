package com.nathcorp.QAPortal.dto.ado;

import com.fasterxml.jackson.annotation.JsonProperty;

public class TestPointItem {

    @JsonProperty("TestCaseId")
    private Integer testCaseId;

    @JsonProperty("LastResultOutcome")
    private String lastResultOutcome;

    public TestPointItem() {
    }

    public Integer getTestCaseId() {
        return testCaseId;
    }

    public void setTestCaseId(Integer testCaseId) {
        this.testCaseId = testCaseId;
    }

    public String getLastResultOutcome() {
        return lastResultOutcome;
    }

    public void setLastResultOutcome(String lastResultOutcome) {
        this.lastResultOutcome = lastResultOutcome;
    }
}
