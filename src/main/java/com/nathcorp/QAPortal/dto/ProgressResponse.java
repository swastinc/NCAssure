package com.nathcorp.QAPortal.dto;

public class ProgressResponse {

    private double smokeProgress;
    private double regressionProgress;
    private double securityProgress;
    private double performanceProgress;

    public double getSmokeProgress() { return smokeProgress; }
    public void setSmokeProgress(double smokeProgress) { this.smokeProgress = smokeProgress; }

    public double getRegressionProgress() { return regressionProgress; }
    public void setRegressionProgress(double regressionProgress) { this.regressionProgress = regressionProgress; }

    public double getSecurityProgress() { return securityProgress; }
    public void setSecurityProgress(double securityProgress) { this.securityProgress = securityProgress; }

    public double getPerformanceProgress() { return performanceProgress; }
    public void setPerformanceProgress(double performanceProgress) { this.performanceProgress = performanceProgress; }
}
