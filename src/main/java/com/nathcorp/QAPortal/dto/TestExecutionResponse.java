package com.nathcorp.QAPortal.dto;

import java.util.List;

public class TestExecutionResponse {

    private List<TestExecutionDto> executions;

    public TestExecutionResponse(List<TestExecutionDto> executions) {
        this.executions = executions;
    }

    public List<TestExecutionDto> getExecutions() {
        return executions;
    }
}
