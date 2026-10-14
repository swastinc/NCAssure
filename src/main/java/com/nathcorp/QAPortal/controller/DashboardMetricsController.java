package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.DashboardMetricsResponse;
import com.nathcorp.QAPortal.service.DashboardMetricsService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardMetricsController {

    private final DashboardMetricsService service;

    public DashboardMetricsController(
            DashboardMetricsService service
    ) {
        this.service = service;
    }

    @GetMapping("/metrics")
    public DashboardMetricsResponse getMetrics(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam(required = false)
            String tagName,

            @RequestParam(required = false)
            String buildName
    ) {
        return service.getDashboardMetrics(
                authorizationHeader,
                organization,
                project,
                tagName,
                buildName
        );
    }
}