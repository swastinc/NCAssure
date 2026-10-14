package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.ado.WorkItemsResponse;
import com.nathcorp.QAPortal.service.OboTokenService;
import com.nathcorp.QAPortal.service.WorkItemService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dashboard")
public class WorkItemController {

    private final WorkItemService service;
    private final OboTokenService oboTokenService;

    public WorkItemController(
            WorkItemService service,
            OboTokenService oboTokenService
    ) {
        this.service = service;
        this.oboTokenService = oboTokenService;
    }

    @GetMapping("/workitems")
    public ResponseEntity<WorkItemsResponse> getBugAndIssueList(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam String tagName,

            @RequestParam String buildName
    ) {
        WorkItemsResponse response =
                service.getBugAndIssueList(
                        authorizationHeader,
                        organization,
                        project,
                        tagName,
                        buildName
                );

        return ResponseEntity.ok(response);
    }
}