package com.nathcorp.QAPortal.dto;

public class IssueMetrics {

    private int reported;
    private int active;
    private int closed;

    public IssueMetrics() {
    }

    public IssueMetrics(int reported, int active, int closed) {
        this.reported = reported;
        this.active = active;
        this.closed = closed;
    }

    public IssueMetrics(int size, long issueActive) {
    }

    public int getReported() {
        return reported;
    }

    public void setReported(int reported) {
        this.reported = reported;
    }

    public int getActive() {
        return active;
    }

    public void setActive(int active) {
        this.active = active;
    }

    public int getClosed() {
        return closed;
    }

    public void setClosed(int closed) {
        this.closed = closed;
    }
}
