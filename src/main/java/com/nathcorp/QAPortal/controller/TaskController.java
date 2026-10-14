package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.TaskDetailsResponse;
import com.nathcorp.QAPortal.service.FetchTaskDetailsService;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final FetchTaskDetailsService taskService;

    public TaskController(FetchTaskDetailsService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public ResponseEntity<TaskDetailsResponse> getTasks(
            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader,

            @RequestParam String organization,

            @RequestParam String project,

            @RequestParam(required = false) String tagName,

            @RequestParam(required = false) String buildName
    ) {
        AuthorizationUtils.requireBearerAuthorization(authorizationHeader);

        return ResponseEntity.ok(
                taskService.getTaskDetails(
                        authorizationHeader,
                        organization,
                        project,
                        tagName,
                        buildName
                )
        );
    }
}
