package com.nathcorp.QAPortal.dto;

import java.time.LocalDate;

public class SignoffRequest {

    private String project;
    private String buildName;
    private String version;
    private LocalDate dateChanged;
    private String completedBy;
    private String approvedBy;
    private String description;
    private String reason;
    private String testEnvironment;
    private String risksAssumptions;
    private String conclusion;
    private String signOffPdfLink;
    private Boolean isApproved;
    private int holdOrWorkaround;
    private int automatedTestCount;
    private float automatedTestPercentage;


    public void setAutomatedTestCount(int automatedTestCount) {
        this.automatedTestCount = automatedTestCount;
    }

    public float getAutomatedTestPercentage() {
        return automatedTestPercentage;
    }

    public void setAutomatedTestPercentage(float automatedTestPercentage) {
        this.automatedTestPercentage = automatedTestPercentage;
    }

    public SignoffRequest(){

        dateChanged = LocalDate.now();
    }
    public String getSignOffPdfLink() {
        return signOffPdfLink;
    }

    public void setSignOffPdfLink(String signOffPdfLink) {
        this.signOffPdfLink = signOffPdfLink;
    }


    public String getProject() {
        return project;
    }

    public void setProject(String project) {
        this.project = project;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public Boolean getApproved() {
        return isApproved;
    }

    public void setApproved(Boolean approved) {
        isApproved = approved;
    }

    public LocalDate getDateChanged() {
        return dateChanged;
    }

    public void setDateChanged(LocalDate dateChanged) {
        this.dateChanged = dateChanged;
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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getTestEnvironment() {
        return testEnvironment;
    }

    public void setTestEnvironment(String testEnvironment) {
        this.testEnvironment = testEnvironment;
    }

    public String getRisksAssumptions() {
        return risksAssumptions;
    }

    public void setRisksAssumptions(String risksAssumptions) {
        this.risksAssumptions = risksAssumptions;
    }

    public String getConclusion() {
        return conclusion;
    }

    public void setConclusion(String conclusion) {
        this.conclusion = conclusion;
    }

    public int getHoldOrWorkaround() {
        return holdOrWorkaround;
    }

    public void setHoldOrWorkaround(int holdOrWorkaround) {
        this.holdOrWorkaround = holdOrWorkaround;
    }

    public int getAutomatedTestCount() {
        return automatedTestCount;
    }

    public String getBuildName() {
        return buildName;
    }

    public void setBuildName(String buildName) {
        this.buildName = buildName;
    }
}
