package com.nathcorp.QAPortal.dto;

import java.util.List;

public class TestCaseDto {

    private int id;
    private String title;
    private List<String> tags;

    public TestCaseDto() {}

    public TestCaseDto(int id, String title, List<String> tags) {
        this.id = id;
        this.title = title;
        this.tags = tags;
    }

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
}
