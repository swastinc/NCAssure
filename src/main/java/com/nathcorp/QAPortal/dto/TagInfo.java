package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class TagInfo {
    @JsonProperty("TagName")
    private String tagName;

    public String getTagName() {
        return tagName;
    }

    public void setTagName(String tagName) {
        this.tagName = tagName;
    }
}