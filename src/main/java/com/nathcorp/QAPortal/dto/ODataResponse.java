package com.nathcorp.QAPortal.dto;

import java.util.List;

public class ODataResponse {
    private List<WorkItemResponse> value;

    public List<WorkItemResponse> getValue() {
        return value;
    }
    public void setValue(List<WorkItemResponse> value) {
        this.value = value;
    }
}
