package com.nathcorp.QAPortal.dto;

public class ConfidenceScoreDTO {

    private int testCasePassPercent;
    private int bugPercent;
    private int confidenceScore;

    public ConfidenceScoreDTO() {
    }

    public ConfidenceScoreDTO(int testCasePassPercent, int bugPercent, int confidenceScore) {
        this.testCasePassPercent = testCasePassPercent;
        this.bugPercent = bugPercent;
        this.confidenceScore = confidenceScore;
    }

    public int getTestCasePassPercent() {
        return testCasePassPercent;
    }

    public void setTestCasePassPercent(int testCasePassPercent) {
        this.testCasePassPercent = testCasePassPercent;
    }

    public int getBugPercent() {
        return bugPercent;
    }

    public void setBugPercent(int bugPercent) {
        this.bugPercent = bugPercent;
    }

    public int getConfidenceScore() {
        return confidenceScore;
    }

    public void setConfidenceScore(int confidenceScore) {
        this.confidenceScore = confidenceScore;
    }
}
