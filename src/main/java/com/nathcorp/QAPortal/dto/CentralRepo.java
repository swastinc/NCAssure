package com.nathcorp.QAPortal.dto;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import org.springframework.data.annotation.Id;

@Container(containerName = "CentralRepository")
public class CentralRepo {

    @Id
    private String id;

    @PartitionKey
    private String projectName;

    private String testCasesTitle;
    private String testCasesLink;
    private String defectsTitle;
    private String defectsLink;
    private String reportsTitle;
    private String reportsLink;

    public CentralRepo() {
    }

    // Getters and Setters

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public String getTestCasesTitle() {
        return testCasesTitle;
    }

    public void setTestCasesTitle(String testCasesTitle) {
        this.testCasesTitle = testCasesTitle;
    }

    public String getTestCasesLink() {
        return testCasesLink;
    }

    public void setTestCasesLink(String testCasesLink) {
        this.testCasesLink = testCasesLink;
    }

    public String getDefectsTitle() {
        return defectsTitle;
    }

    public void setDefectsTitle(String defectsTitle) {
        this.defectsTitle = defectsTitle;
    }

    public String getDefectsLink() {
        return defectsLink;
    }

    public void setDefectsLink(String defectsLink) {
        this.defectsLink = defectsLink;
    }

    public String getReportsTitle() {
        return reportsTitle;
    }

    public void setReportsTitle(String reportsTitle) {
        this.reportsTitle = reportsTitle;
    }

    public String getReportsLink() {
        return reportsLink;
    }

    public void setReportsLink(String reportsLink) {
        this.reportsLink = reportsLink;
    }
}
