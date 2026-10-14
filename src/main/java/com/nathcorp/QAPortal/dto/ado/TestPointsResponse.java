package com.nathcorp.QAPortal.dto.ado;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public class TestPointsResponse {

    @JsonProperty("value")
    private List<TestPointItem> value;

    public TestPointsResponse() {
    }

    public List<TestPointItem> getValue() {
        return value;
    }

    public void setValue(List<TestPointItem> value) {
        this.value = value;
    }
}
