package com.nathcorp.QAPortal.dto;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import org.springframework.data.annotation.Id;

@Container(containerName = "Users")
public class User {

    @Id
    private String id;

    @PartitionKey
    private String email;

    /*
     * Store these values as ISO-8601 strings.
     * Example: 2026-02-03T07:01:07Z
     */
    private String lastSeenBuildApprovalAt;
    private String lastSeenSignOffApprovalAt;

    private String name;
    private String role;
    private String department;

    public User() {
    }

    public User(
            String id,
            String email,
            String lastSeenBuildApprovalAt,
            String lastSeenSignOffApprovalAt,
            String name,
            String role,
            String department
    ) {
        this.id = id;
        this.email = email;
        this.lastSeenBuildApprovalAt = lastSeenBuildApprovalAt;
        this.lastSeenSignOffApprovalAt = lastSeenSignOffApprovalAt;
        this.name = name;
        this.role = role;
        this.department = department;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getLastSeenBuildApprovalAt() {
        return lastSeenBuildApprovalAt;
    }

    public void setLastSeenBuildApprovalAt(
            String lastSeenBuildApprovalAt
    ) {
        this.lastSeenBuildApprovalAt = lastSeenBuildApprovalAt;
    }

    public String getLastSeenSignOffApprovalAt() {
        return lastSeenSignOffApprovalAt;
    }

    public void setLastSeenSignOffApprovalAt(
            String lastSeenSignOffApprovalAt
    ) {
        this.lastSeenSignOffApprovalAt =
                lastSeenSignOffApprovalAt;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }
}