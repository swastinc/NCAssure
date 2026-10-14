package com.nathcorp.QAPortal.dto;

public class BugMetrics {

    private int reported;
    private int active;
    private int closed;
    private int resolved;

    public BugMetrics() {
    }

    public BugMetrics(int reported, int active, int closed, int resolved) {
        this.reported = reported;
        this.active = active;
        this.closed = closed;
        this.resolved = resolved;
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

    public int getResolved() {
        return resolved;
    }

    public void setResolved(int resolved) {
        this.resolved = resolved;
    }
}