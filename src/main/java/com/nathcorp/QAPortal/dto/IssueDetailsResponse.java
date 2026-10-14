package com.nathcorp.QAPortal.dto;

import java.util.List;

public class IssueDetailsResponse {

    private List<IssueItem> value;

    public List<IssueItem> getValue() {
        return value;
    }

    public void setValue(List<IssueItem> value) {
        this.value = value;
    }
}
