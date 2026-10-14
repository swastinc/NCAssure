// CreateBugArgs.java
package com.nathcorp.QAPortal.dto;

public record CreateBugArgs(
    String project,          // required
    String title,            // required
    String description,      // optional (HTML ok)
    String reproSteps,       // optional (HTML ok)
    Integer priority,        // optional (1-4)
    String severity,         // optional (example: "2 - High" depending on your process)
    String assignedTo,       // optional (email or display name)
    String tags              // optional (semicolon separated: "QAPortal;Staging")
) {}
