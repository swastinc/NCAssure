package com.nathcorp.QAPortal.Entity;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import org.springframework.data.annotation.Id;

import java.time.LocalDate;

@Container(containerName = "Signoff")
public class    SignoffDocument {

    @Id
    private String id;

    public Boolean getApproved() {
        return isApproved;
    }

    public void setApproved(Boolean approved) {
        isApproved = approved;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    @PartitionKey
    private String projectName;
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
    private Boolean isApproved;
    private int automatedTestCount;
    private double automationCoverage;
    private String notes;
    private String pdfPath;
    private String createdAt;
    private int holdOrWorkaround;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getProject() {
        return projectName;
    }

    public void setProject(String project) {
        this.projectName = project;
    }

    public String getVersion() {
        return version;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public Boolean getIsApproved() {
        return isApproved;
    }

    public void setIsApproved(Boolean isApproved) {
        this.isApproved = isApproved;
    }

    public void setVersion(String version) {
        this.version = version;
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

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public int getHoldOrWorkaround() {
        return holdOrWorkaround;
    }

    public void setHoldOrWorkaround(int holdOrWorkaround) {
        this.holdOrWorkaround = holdOrWorkaround;
    }

    public String getBuildName() {
        return buildName;
    }

    public void setBuildName(String buildName) {
        this.buildName = buildName;
    }
}
