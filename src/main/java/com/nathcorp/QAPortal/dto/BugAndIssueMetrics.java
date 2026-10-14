package com.nathcorp.QAPortal.dto;

public class BugAndIssueMetrics {

    private int total;
    private int open;
    private int closed;
    private int holdOrWorkaround;

    public BugAndIssueMetrics() {
    }

    public BugAndIssueMetrics(int total, int open, int closed, int holdOrWorkaround) {
        this.total = total;
        this.open = open;
        this.closed = closed;
        this.holdOrWorkaround = holdOrWorkaround;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public int getOpen() {
        return open;
    }

    public void setOpen(int open) {
        this.open = open;
    }

    public int getClosed() {
        return closed;
    }

    public void setClosed(int closed) {
        this.closed = closed;
    }

    public int getHoldOrWorkaround() {
        return holdOrWorkaround;
    }

    public void setHoldOrWorkaround(int holdOrWorkaround) {
        this.holdOrWorkaround = holdOrWorkaround;
    }
}
