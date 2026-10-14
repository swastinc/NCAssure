package com.nathcorp.QAPortal.dto;

public class DashboardMetricsResponse {

    private TaskMetrics tasks;
    private BugMetrics bugs;
    private IssueMetrics issues;
    private BugAndIssueMetrics bugAndIssue;

    public DashboardMetricsResponse() {
    }

    public DashboardMetricsResponse(
            TaskMetrics tasks,
            BugMetrics bugs,
            IssueMetrics issues,
            BugAndIssueMetrics bugAndIssue
    ) {
        this.tasks = tasks;
        this.bugs = bugs;
        this.issues = issues;
        this.bugAndIssue = bugAndIssue;
    }

    public TaskMetrics getTasks() {
        return tasks;
    }

    public void setTasks(TaskMetrics tasks) {
        this.tasks = tasks;
    }

    public BugMetrics getBugs() {
        return bugs;
    }

    public void setBugs(BugMetrics bugs) {
        this.bugs = bugs;
    }

    public IssueMetrics getIssues() {
        return issues;
    }

    public void setIssues(IssueMetrics issues) {
        this.issues = issues;
    }

    public BugAndIssueMetrics getBugAndIssue() {
        return bugAndIssue;
    }

    public void setBugAndIssue(BugAndIssueMetrics bugAndIssue) {
        this.bugAndIssue = bugAndIssue;
    }
}
