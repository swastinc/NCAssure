package com.nathcorp.QAPortal.dto;

import java.util.List;

public class BugDetailsResponse {


    private List<BugItem> value;

    public List<BugItem> getValue() {
        return value;
    }

    public void setValue(List<BugItem> value) {
        this.value = value;
    }
}
