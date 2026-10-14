package com.nathcorp.QAPortal.dto;

import java.util.Map;

public record BugSeverityResponse(
        Map<String, Long> counts
) {}
