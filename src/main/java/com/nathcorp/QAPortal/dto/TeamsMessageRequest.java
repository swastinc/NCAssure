package com.nathcorp.QAPortal.dto;

public class TeamsMessageRequest {

    private String teamId;
    private String channelId;

    // Build details (existing)
    private String projectId;

    // Sign-off details (NEW - minimal additions)
    private String project;
    private String version;
    private String completedBy;
    private String dateChanged;     // keep String to avoid LocalDate parsing issues
    private String signOffPdfLink;

    private String remarks; // existing

    public TeamsMessageRequest() {}

    public String getTeamId() { return teamId; }
    public void setTeamId(String teamId) { this.teamId = teamId; }

    public String getChannelId() { return channelId; }
    public void setChannelId(String channelId) { this.channelId = channelId; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    // ---- NEW getters/setters for Sign-off ----
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getCompletedBy() { return completedBy; }
    public void setCompletedBy(String completedBy) { this.completedBy = completedBy; }

    public String getDateChanged() { return dateChanged; }
    public void setDateChanged(String dateChanged) { this.dateChanged = dateChanged; }

    public String getSignOffPdfLink() { return signOffPdfLink; }
    public void setSignOffPdfLink(String signOffPdfLink) { this.signOffPdfLink = signOffPdfLink; }

    // ---- existing ----
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getSummary() { return remarks; }
}
