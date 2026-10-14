package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class TestCaseInfo {
    @JsonProperty("Title")
    private String title;
    @JsonProperty("Tags")
    private List<TagInfo> tags;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public List<TagInfo> getTags() {
        return tags;
    }

    public void setTags(List<TagInfo> tags) {
        this.tags = tags;
    }
}
