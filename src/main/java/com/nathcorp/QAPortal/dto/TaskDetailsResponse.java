package com.nathcorp.QAPortal.dto;

import java.util.List;

public class TaskDetailsResponse {

    private List<TaskItem> value;

    public List<TaskItem> getValue() {
        return value;
    }

    public void setValue(List<TaskItem> value) {
        this.value = value;
    }
}
