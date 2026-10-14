package com.nathcorp.QAPortal.dto;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import org.springframework.data.annotation.Id;

@Container(containerName = "TestingStats")
public class TestingStats {

    @Id
    private String id;

    @PartitionKey
    private String projectName;

    private String projectVersion;

    private int sanityTesting;
    private int regressionTesting;
    private int securityTesting;
    private int performanceTesting;

    // --- Getters and Setters ---
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

    public String getProjectVersion() {
        return projectVersion;
    }

    public void setProjectVersion(String projectVersion) {
        this.projectVersion = projectVersion;
    }

    public int getSanityTesting() {
        return sanityTesting;
    }

    public void setSanityTesting(int sanityTesting) {
        this.sanityTesting = sanityTesting;
    }

    public int getRegressionTesting() {
        return regressionTesting;
    }

    public void setRegressionTesting(int regressionTesting) {
        this.regressionTesting = regressionTesting;
    }

    public int getSecurityTesting() {
        return securityTesting;
    }

    public void setSecurityTesting(int securityTesting) {
        this.securityTesting = securityTesting;
    }

    public int getPerformanceTesting() {
        return performanceTesting;
    }

    public void setPerformanceTesting(int performanceTesting) {
        this.performanceTesting = performanceTesting;
    }
}
