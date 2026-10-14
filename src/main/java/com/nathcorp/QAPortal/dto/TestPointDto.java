package com.nathcorp.QAPortal.dto;

public class TestPointDto {

    private int testCaseId;
    private String lastResultOutcome;

    public TestPointDto() {}

    public TestPointDto(int testCaseId, String lastResultOutcome) {
        this.testCaseId = testCaseId;
        this.lastResultOutcome = lastResultOutcome;
    }

    public int getTestCaseId() { return testCaseId; }
    public void setTestCaseId(int testCaseId) { this.testCaseId = testCaseId; }

    public String getLastResultOutcome() { return lastResultOutcome; }
    public void setLastResultOutcome(String lastResultOutcome) { this.lastResultOutcome = lastResultOutcome; }
}
