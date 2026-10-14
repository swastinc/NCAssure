package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class Tag {

    @JsonProperty("TagSK")
    private int tagSK;

    @JsonProperty("ProjectSK")
    private String projectSK;

    @JsonProperty("TagId")
    private String tagId;

    @JsonProperty("TagName")
    private String tagName;

    public int getTagSK() {
        return tagSK;
    }

    public void setTagSK(int tagSK) {
        this.tagSK = tagSK;
    }

    public String getProjectSK() {
        return projectSK;
    }

    public void setProjectSK(String projectSK) {
        this.projectSK = projectSK;
    }

    public String getTagId() {
        return tagId;
    }

    public void setTagId(String tagId) {
        this.tagId = tagId;
    }

    public String getTagName() {
        return tagName;
    }

    public void setTagName(String tagName) {
        this.tagName = tagName;
    }
}
