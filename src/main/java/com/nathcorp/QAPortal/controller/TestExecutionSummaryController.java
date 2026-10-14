package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.PieChartTestExecutionSummaryDto;
import com.nathcorp.QAPortal.dto.TestExecutionDto;
import com.nathcorp.QAPortal.dto.TestExecutionResponse;
import com.nathcorp.QAPortal.service.OboTokenService;
import com.nathcorp.QAPortal.service.TestExecutionSummaryService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/testpoints")
public class TestExecutionSummaryController {

    private final TestExecutionSummaryService service;
    private final OboTokenService tokenStore;

    public TestExecutionSummaryController(
            TestExecutionSummaryService service,
            OboTokenService tokenStore
    ) {
        this.service = service;
        this.tokenStore = tokenStore;
    }

    @GetMapping
    public ResponseEntity<TestExecutionResponse> getLatestTestExecutions(

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
        return ResponseEntity.ok(
                service.getLatestExecutions(
                        authorizationHeader,
                        organization,
                        project,
                        tagName,
                        buildName
                )
        );
    }

    // For Test Execution Pie Chart
    @GetMapping("/summary")
    public ResponseEntity<List<PieChartTestExecutionSummaryDto>> getSummary(

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
        return ResponseEntity.ok(
                service.getLatestExecutionSummary(
                        authorizationHeader,
                        organization,
                        project,
                        tagName,
                        buildName
                )
        );
    }

    // CSV download endpoint
    @GetMapping("/test-results/download/csv")
    public ResponseEntity<byte[]> downloadCsv(

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
        TestExecutionResponse response =
                service.getLatestExecutions(
                        authorizationHeader,
                        organization,
                        project,
                        tagName,
                        buildName
                );

        List<TestExecutionDto> executions =
                response == null || response.getExecutions() == null
                        ? List.of()
                        : response.getExecutions();

        byte[] csvData =
                service.generateExecutionCsv(executions);

        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=test-results.csv"
                )
                .header(
                        HttpHeaders.CONTENT_TYPE,
                        "text/csv"
                )
                .body(csvData);
    }
}