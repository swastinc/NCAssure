package com.nathcorp.QAPortal.dto;

public class AzureWorkItemUrlInfo {

    private UrlField self;
    private UrlField workItemUpdates;
    private UrlField workItemRevisions;
    private UrlField workItemHistory;
    private UrlField html;
    private UrlField workItemType;
    private UrlField fields;

    public UrlField getSelf() { return self; }
    public void setSelf(UrlField self) { this.self = self; }

    public UrlField getWorkItemUpdates() { return workItemUpdates; }
    public void setWorkItemUpdates(UrlField workItemUpdates) { this.workItemUpdates = workItemUpdates; }

    public UrlField getWorkItemRevisions() { return workItemRevisions; }
    public void setWorkItemRevisions(UrlField workItemRevisions) { this.workItemRevisions = workItemRevisions; }

    public UrlField getWorkItemHistory() { return workItemHistory; }
    public void setWorkItemHistory(UrlField workItemHistory) { this.workItemHistory = workItemHistory; }

    public UrlField getHtml() { return html; }
    public void setHtml(UrlField html) { this.html = html; }

    public UrlField getWorkItemType() { return workItemType; }
    public void setWorkItemType(UrlField workItemType) { this.workItemType = workItemType; }

    public UrlField getFields() { return fields; }
    public void setFields(UrlField fields) { this.fields = fields; }
}
