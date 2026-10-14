package com.nathcorp.QAPortal.Entity;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import org.springframework.data.annotation.Id;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.UUID;

@Container(containerName = "ActivityLogs")
public class ActivityLog {

    @Id
    private String id;

    @PartitionKey
    private String performedBy;

    private String actionType;
    private LocalDateTime timestamp;
    private String details;

    public ActivityLog() {}

    public ActivityLog(String actionType, String performedBy, String details) {
        this.id = UUID.randomUUID().toString();
        this.actionType = actionType;
        this.timestamp = LocalDateTime.now();
        this.performedBy = performedBy;
        this.details = details;
    }

    // ---------------------- Getters & Setters ----------------------

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }

    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }

    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }


}
