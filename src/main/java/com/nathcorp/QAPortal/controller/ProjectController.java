package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.ProjectsResponse;
import com.nathcorp.QAPortal.service.FetchProjectService;
import com.nathcorp.QAPortal.service.OboTokenService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ado")
public class ProjectController {

    private final FetchProjectService svc;
    private final OboTokenService tokenStore;

    public ProjectController(
            FetchProjectService svc,
            OboTokenService tokenStore
    ) {
        this.svc = svc;
        this.tokenStore = tokenStore;
    }

    @GetMapping("/projects")
    public ResponseEntity<ProjectsResponse> all(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam(defaultValue = "2")
            int years
    ) {
        return ResponseEntity.ok(
                svc.getProjectsUpdatedWithinYears(
                        years,
                        authorizationHeader
                )
        );
    }

    @GetMapping
    public ResponseEntity<String> test(
    ) {
        return ResponseEntity.ok("Ado Controller is up");
    }
}