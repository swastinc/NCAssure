package com.nathcorp.QAPortal.dto.ado;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public class WorkItemsResponse {

    @JsonProperty("value")
    private List<WorkItem> value;

    public WorkItemsResponse() {
    }

    public List<WorkItem> getValue() {
        return value;
    }

    public void setValue(List<WorkItem> value) {
        this.value = value;
    }
}
