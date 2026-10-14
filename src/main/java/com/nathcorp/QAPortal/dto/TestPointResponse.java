package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class TestPointResponse {
    @JsonProperty("@odata.context")
    private String odataContext;

    @JsonProperty("value")
    private List<TestPointValue> value;

    public String getOdataContext() {
        return odataContext;
    }

    public void setOdataContext(String odataContext) {
        this.odataContext = odataContext;
    }

    public List<TestPointValue> getValue() {
        return value;
    }

    public void setValue(List<TestPointValue> value) {
        this.value = value;
    }
}
