package com.nathcorp.QAPortal.dto;

public class SignoffOverviewResponse {

    private String id;
    private String buildName;
    private String version;
    private String completedBy;
    private String approvedBy;
    private int automatedTestCount;
    private double automationCoverage;
    private String pdfPath;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getCompletedBy() {
        return completedBy;
    }

    public void setCompletedBy(String completedBy) {
        this.completedBy = completedBy;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(String approvedBy) {
        this.approvedBy = approvedBy;
    }

    public int getAutomatedTestCount() {
        return automatedTestCount;
    }

    public void setAutomatedTestCount(int automatedTestCount) {
        this.automatedTestCount = automatedTestCount;
    }

    public double getAutomationCoverage() {
        return automationCoverage;
    }

    public void setAutomationCoverage(double automationCoverage) {
        this.automationCoverage = automationCoverage;
    }

    public String getPdfPath() {
        return pdfPath;
    }

    public void setPdfPath(String pdfPath) {
        this.pdfPath = pdfPath;
    }

    public String getBuildName() {
        return buildName;
    }

    public void setBuildName(String buildName) {
        this.buildName = buildName;
    }
}
