package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.BugAndIssueMetrics;
import com.nathcorp.QAPortal.dto.BugDetailsResponse;
import com.nathcorp.QAPortal.dto.BugItem;
import com.nathcorp.QAPortal.dto.BugMetrics;
import com.nathcorp.QAPortal.dto.DashboardMetricsResponse;
import com.nathcorp.QAPortal.dto.IssueDetailsResponse;
import com.nathcorp.QAPortal.dto.IssueItem;
import com.nathcorp.QAPortal.dto.IssueMetrics;
import com.nathcorp.QAPortal.dto.TaskDetailsResponse;
import com.nathcorp.QAPortal.dto.TaskItem;
import com.nathcorp.QAPortal.dto.TaskMetrics;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class DashboardMetricsService {

    private final FetchBugDetailsService fetchBugDetailsService;
    private final FetchIssueDetailsService fetchIssueDetailsService;
    private final FetchTaskDetailsService fetchTaskDetailsService;

    public DashboardMetricsService(
            FetchBugDetailsService fetchBugDetailsService,
            FetchIssueDetailsService fetchIssueDetailsService,
            FetchTaskDetailsService fetchTaskDetailsService
    ) {
        this.fetchBugDetailsService = fetchBugDetailsService;
        this.fetchIssueDetailsService = fetchIssueDetailsService;
        this.fetchTaskDetailsService = fetchTaskDetailsService;
    }

    public DashboardMetricsResponse getDashboardMetrics(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        validateInputs(organization, project);

        BugDetailsResponse bugResponse = fetchBugDetailsService.getBugDetails(
                authorizationHeader,
                organization,
                project,
                tagName,
                buildName
        );

        IssueDetailsResponse issueResponse = fetchIssueDetailsService.getIssueDetails(
                authorizationHeader,
                organization,
                project,
                tagName,
                buildName
        );

        TaskDetailsResponse taskResponse = fetchTaskDetailsService.getTaskDetails(
                authorizationHeader,
                organization,
                project,
                tagName,
                buildName
        );

        List<BugItem> bugs =
                bugResponse == null || bugResponse.getValue() == null
                        ? List.of()
                        : bugResponse.getValue();

        List<IssueItem> issues =
                issueResponse == null || issueResponse.getValue() == null
                        ? List.of()
                        : issueResponse.getValue();

        List<TaskItem> tasks =
                taskResponse == null || taskResponse.getValue() == null
                        ? List.of()
                        : taskResponse.getValue();

        return buildResponse(tasks, bugs, issues);
    }

    private DashboardMetricsResponse buildResponse(
            List<TaskItem> tasks,
            List<BugItem> bugs,
            List<IssueItem> issues
    ) {
        List<TaskItem> safeTasks =
                tasks == null
                        ? List.of()
                        : tasks.stream()
                        .filter(Objects::nonNull)
                        .toList();

        List<BugItem> safeBugs =
                bugs == null
                        ? List.of()
                        : bugs.stream()
                        .filter(Objects::nonNull)
                        .toList();

        List<IssueItem> safeIssues =
                issues == null
                        ? List.of()
                        : issues.stream()
                        .filter(Objects::nonNull)
                        .toList();

        Map<String, Integer> taskStatusCounts = new LinkedHashMap<>();

        for (TaskItem task : safeTasks) {
            String state = task.getState();
            String status = state == null || state.isBlank()
                    ? "Unknown"
                    : state.trim();

            taskStatusCounts.merge(status, 1, Integer::sum);
        }

        TaskMetrics taskMetrics = new TaskMetrics(
                safeTasks.size(),
                taskStatusCounts
        );

        int bugActive =
                (int) safeBugs.stream()
                        .filter(bug -> "Active".equalsIgnoreCase(bug.getState()))
                        .count();

        int bugClosed =
                (int) safeBugs.stream()
                        .filter(bug -> "Closed".equalsIgnoreCase(bug.getState()))
                        .count();

        int bugResolved =
                (int) safeBugs.stream()
                        .filter(bug -> "Resolved".equalsIgnoreCase(bug.getState()))
                        .count();

        BugMetrics bugMetrics = new BugMetrics(
                safeBugs.size(),
                bugActive,
                bugClosed,
                bugResolved
        );

        int issueActive =
                (int) safeIssues.stream()
                        .filter(issue -> "Active".equalsIgnoreCase(issue.getState()))
                        .count();

        int issueClosed =
                (int) safeIssues.stream()
                        .filter(issue -> "Closed".equalsIgnoreCase(issue.getState()))
                        .count();

        IssueMetrics issueMetrics = new IssueMetrics(
                safeIssues.size(),
                issueActive,
                issueClosed
        );

        BugAndIssueMetrics combined = new BugAndIssueMetrics(
                safeBugs.size() + safeIssues.size(),
                bugActive + issueActive,
                bugClosed + issueClosed,
                0
        );

        DashboardMetricsResponse response = new DashboardMetricsResponse();
        response.setTasks(taskMetrics);
        response.setBugs(bugMetrics);
        response.setIssues(issueMetrics);
        response.setBugAndIssue(combined);

        return response;
    }

    private void validateInputs(String organization, String project) {
        if (organization == null || organization.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "organization is required"
            );
        }

        if (project == null || project.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "project is required"
            );
        }
    }
}