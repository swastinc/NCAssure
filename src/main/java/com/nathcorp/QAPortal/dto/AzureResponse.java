package com.nathcorp.QAPortal.dto;

import java.util.List;

public class AzureResponse {

    private List<WorkItem> value;

    public List<WorkItem> getValue() {
        return value;
    }

    public void setValue(List<WorkItem> value) {
        this.value = value;
    }
}
