// src/main/java/com/nathcorp/qaportal/dto/AdoProjectsResponse.java
package com.nathcorp.QAPortal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ProjectsResponse {
    private int count;
    private List<Project> value;

    public int getCount() { return count; }
    public void setCount(int count) { this.count = count; }
    public List<Project> getValue() { return value; }
    public void setValue(List<Project> value) { this.value = value; }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Project {
        private String id;                 // keep as String (UUID text)
        private String name;
        private URI url;
        private String state;              // e.g., "wellFormed"
        private Integer revision;
        private String visibility;         // "private" | "public"
        private OffsetDateTime lastUpdateTime;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public URI getUrl() { return url; }
        public void setUrl(URI url) { this.url = url; }
        public String getState() { return state; }
        public void setState(String state) { this.state = state; }
        public Integer getRevision() { return revision; }
        public void setRevision(Integer revision) { this.revision = revision; }
        public String getVisibility() { return visibility; }
        public void setVisibility(String visibility) { this.visibility = visibility; }
        public OffsetDateTime getLastUpdateTime() { return lastUpdateTime; }
        public void setLastUpdateTime(OffsetDateTime lastUpdateTime) { this.lastUpdateTime = lastUpdateTime; }
    }
}
