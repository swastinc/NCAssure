package com.nathcorp.QAPortal.dto.ado;

import com.fasterxml.jackson.annotation.JsonProperty;

public class WorkItemTag {

    @JsonProperty("TagName")
    private String tagName;

    public String getTagName() {
        return tagName;
    }

    public void setTagName(String tagName) {
        this.tagName = tagName;
    }
}
