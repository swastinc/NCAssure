package com.nathcorp.QAPortal.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nathcorp.QAPortal.dto.ConfidenceScoreDTO;
import com.nathcorp.QAPortal.dto.TestExecutionResponse;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.SocketTimeoutException;
import java.net.URI;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Service
public class ConfidenceScoreService {

    private final RestTemplate restTemplate;
    private final ObjectMapper mapper;
    private final OboTokenService oboTokenService;

    public ConfidenceScoreService(
            RestTemplate restTemplate,
            ObjectMapper mapper,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.mapper = mapper;
        this.oboTokenService = oboTokenService;
    }

    public CompletableFuture<ConfidenceScoreDTO> calculateConfidenceScore(
            String authorizationHeader,
            String organization,
            String project,
            String tagName
    ) {
        return calculateConfidenceScore(
                authorizationHeader,
                organization,
                project,
                tagName,
                null
        );
    }

    public CompletableFuture<ConfidenceScoreDTO> calculateConfidenceScore(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        validateCommonInputs(organization, project);

        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);

        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        try {
            int issuePriorityPercent = calculateIssuePriorityPercent(
                    adoToken,
                    organization,
                    project,
                    tagName,
                    buildName
            );

            // Fetch Bug IDs using standard WIQL instead of Analytics API
            List<Integer> bugIds = fetchWorkItemIdsUsingWiql(
                    adoToken, organization, project, tagName, buildName, "Bug"
            );

            int totalBugsAllStates = bugIds.size();
            int totalActiveBugs = 0;
            long weightedBugIndex = 0L;

            // Fetch state and severity in batch and aggregate in memory
            if (totalBugsAllStates > 0) {
                List<Map<String, Object>> bugs = fetchWorkItemDetailsBatch(
                        adoToken,
                        organization,
                        project,
                        bugIds,
                        List.of("System.State", "Microsoft.VSTS.Common.Severity")
                );

                for (Map<String, Object> bug : bugs) {
                    Object fieldsObj = bug.get("fields");

                    if (!(fieldsObj instanceof Map<?, ?> fields)) {
                        continue;
                    }

                    String state = toStringValue(fields.get("System.State"));

                    if (isActiveWorkItemState(state)) {
                        totalActiveBugs++;
                        String severity = toStringValue(fields.get("Microsoft.VSTS.Common.Severity"));
                        weightedBugIndex += bugWeight(severity);
                    }
                }
            }

            int bugPercent;

            if (totalActiveBugs == 0 && totalBugsAllStates == 0) {
                bugPercent = 0;
            } else if (totalActiveBugs == 0 && totalBugsAllStates > 0) {
                bugPercent = 100;
            } else {
                long maxWeightedBugIndex = (long) totalBugsAllStates * 5L;

                double penaltyPercent =
                        maxWeightedBugIndex == 0
                                ? 100.0
                                : (weightedBugIndex * 100.0) / maxWeightedBugIndex;

                bugPercent = (int) Math.round(100.0 - penaltyPercent);
            }

            bugPercent = clamp0to100(bugPercent);

            double confidenceScore = (bugPercent + issuePriorityPercent) / 2.0;

            ConfidenceScoreDTO response = new ConfidenceScoreDTO(
                    issuePriorityPercent,
                    bugPercent,
                    (int) confidenceScore
            );

            return CompletableFuture.completedFuture(response);

        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps network timeout");
            return null; // unreachable due to throw
        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps confidence score API failed");
        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Error processing confidence score",
                    e
            );
        }
    }

    public TestExecutionResponse getLatestExecutions(
            String authorizationHeader, String organization, String project, String tagName
    ) {
        return getLatestExecutions(authorizationHeader, organization, project, tagName, null);
    }

    public TestExecutionResponse getLatestExecutions(
            String authorizationHeader, String organization, String project, String tagName, String buildName
    ) {
        return new TestExecutionResponse(List.of());
    }

    private int calculateIssuePriorityPercent(
            String adoToken, String organization, String project, String tagName, String buildName
    ) {
        List<Integer> issueIds = fetchWorkItemIdsUsingWiql(
                adoToken, organization, project, tagName, buildName, "Issue"
        );

        if (issueIds.isEmpty()) {
            return 0;
        }

        List<Map<String, Object>> issues = fetchWorkItemDetailsBatch(
                adoToken,
                organization,
                project,
                issueIds,
                List.of("System.State", "Microsoft.VSTS.Common.Priority")
        );

        int totalIssuesAllStates = issues.size();
        int totalActiveIssues = 0;
        long weightedIssueIndex = 0L;

        for (Map<String, Object> issue : issues) {
            Object fieldsObj = issue.get("fields");
            if (!(fieldsObj instanceof Map<?, ?> fields)) continue;

            String state = toStringValue(fields.get("System.State"));

            if (!isActiveWorkItemState(state)) continue;

            totalActiveIssues++;
            weightedIssueIndex += issuePriorityWeight(fields.get("Microsoft.VSTS.Common.Priority"));
        }

        if (totalActiveIssues == 0 && totalIssuesAllStates == 0) return 0;
        if (totalActiveIssues == 0 && totalIssuesAllStates > 0) return 100;

        long maxWeightedIssueIndex = (long) totalIssuesAllStates * 5L;

        double penaltyPercent =
                maxWeightedIssueIndex == 0
                        ? 100.0
                        : (weightedIssueIndex * 100.0) / maxWeightedIssueIndex;

        return clamp0to100((int) Math.round(100.0 - penaltyPercent));
    }

    // Consolidated WIQL fetcher for both Bugs and Issues
    private List<Integer> fetchWorkItemIdsUsingWiql(
            String adoToken,
            String organization,
            String project,
            String tagName,
            String buildName,
            String workItemType
    ) {
        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{organization}/{project}/_apis/wit/wiql")
                .queryParam("api-version", "7.1")
                .queryParam("$top", "200") // Adjust top as necessary for your scale
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        Map<String, String> body = new LinkedHashMap<>();
        body.put("query", buildWorkItemWiql(project, tagName, buildName, workItemType));

        HttpHeaders headers = buildAdoHeaders(adoToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    uri, HttpMethod.POST, request, Map.class
            );

            Map responseBody = response.getBody();
            if (responseBody == null) return List.of();

            Object workItemsObj = responseBody.get("workItems");
            if (!(workItemsObj instanceof List<?> workItems)) return List.of();

            List<Integer> ids = new ArrayList<>();
            for (Object itemObj : workItems) {
                if (itemObj instanceof Map<?, ?> item) {
                    Integer id = toInteger(item.get("id"));
                    if (id != null) ids.add(id);
                }
            }
            return ids;

        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps WIQL query timed out.");
            return List.of();
        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps WIQL query failed for " + workItemType);
        }
    }

    // Consolidated Batch Fetcher
    private List<Map<String, Object>> fetchWorkItemDetailsBatch(
            String adoToken,
            String organization,
            String project,
            List<Integer> itemIds,
            List<String> fieldsToFetch
    ) {
        if (itemIds == null || itemIds.isEmpty()) return List.of();

        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{organization}/{project}/_apis/wit/workitemsbatch")
                .queryParam("api-version", "7.1")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ids", itemIds);

        List<String> defaultFields = new ArrayList<>(List.of("System.Id", "System.State"));
        for (String field : fieldsToFetch) {
            if (!defaultFields.contains(field)) {
                defaultFields.add(field);
            }
        }
        body.put("fields", defaultFields);

        HttpHeaders headers = buildAdoHeaders(adoToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    uri, HttpMethod.POST, request, Map.class
            );
            return extractValueList(response.getBody());
        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps work items batch call timed out.");
            return List.of();
        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps work items batch call failed");
        }
    }

    private static String buildWorkItemWiql(
            String project,
            String tagName,
            String buildName,
            String workItemType
    ) {
        StringBuilder wiql = new StringBuilder();

        wiql.append("SELECT [System.Id] FROM WorkItems ")
                .append("WHERE [System.TeamProject] = '")
                .append(escapeWiqlValue(project))
                .append("' AND [System.WorkItemType] = '")
                .append(escapeWiqlValue(workItemType))
                .append("'");

        appendWiqlTagCondition(wiql, tagName);
        appendWiqlTagCondition(wiql, buildName);

        wiql.append(" ORDER BY [System.ChangedDate] DESC");

        return wiql.toString();
    }

    private static void appendWiqlTagCondition(StringBuilder wiql, String tagName) {
        if (tagName == null || tagName.isBlank()) return;

        wiql.append(" AND [System.Tags] CONTAINS '")
                .append(escapeWiqlValue(tagName.trim()))
                .append("'");
    }

    private static boolean isActiveWorkItemState(String state) {
        return state != null &&
                (state.equalsIgnoreCase("New") ||
                        state.equalsIgnoreCase("Active") ||
                        state.equalsIgnoreCase("Resolved"));
    }

    private static String escapeWiqlValue(String value) {
        return value == null ? "" : value.replace("'", "''");
    }

    private static void validateCommonInputs(String organization, String project) {
        if (organization == null || organization.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "organization is required");
        }
        if (project == null || project.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "project is required");
        }
    }

    private static HttpHeaders buildAdoHeaders(String adoToken) {
        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Azure DevOps token is required");
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-TFS-FedAuthRedirect", "Suppress");
        headers.setBearerAuth(adoToken);
        return headers;
    }

    private static List<Map<String, Object>> extractValueList(Map body) {
        if (body == null) return List.of();
        Object value = body.get("value");
        if (!(value instanceof List<?> list)) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> normalized = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    if (entry.getKey() != null) {
                        normalized.put(String.valueOf(entry.getKey()), entry.getValue());
                    }
                }
                result.add(normalized);
            }
        }
        return result;
    }

    private static ResponseStatusException mapAdoHttpException(HttpStatusCodeException e, String message) {
        String contentType = e.getResponseHeaders() != null && e.getResponseHeaders().getContentType() != null
                ? e.getResponseHeaders().getContentType().toString() : "unknown";
        String body = e.getResponseBodyAsString();

        System.err.println("[ConfidenceScoreService] ADO status = " + e.getStatusCode());
        System.err.println("[ConfidenceScoreService] ADO content-type = " + contentType);
        System.err.println("[ConfidenceScoreService] ADO body = " + truncate(body));

        if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
            return new ResponseStatusException(HttpStatus.UNAUTHORIZED, message + ": Token rejected.", e);
        }
        if (e.getStatusCode() == HttpStatus.FORBIDDEN) {
            return new ResponseStatusException(HttpStatus.FORBIDDEN, message + ": Missing permissions.", e);
        }
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, message + ": " + e.getStatusCode(), e);
    }

    private static void handleResourceAccessException(ResourceAccessException e, String timeoutMessage) {
        Throwable root = e.getMostSpecificCause();
        if (root instanceof SocketTimeoutException) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, timeoutMessage, e);
        }
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Azure DevOps network error: " + e.getMessage(), e);
    }

    private static int bugWeight(String severity) {
        if (severity == null) return 0;
        String value = severity.toLowerCase(Locale.ROOT);
        if (value.contains("critical")) return 5;
        if (value.contains("high")) return 3;
        if (value.contains("medium")) return 2;
        if (value.contains("low")) return 1;
        return 0;
    }

    private static int issuePriorityWeight(Object priorityValue) {
        if (priorityValue == null) return 0;
        int priority = safeInt(priorityValue);
        return switch (priority) {
            case 1 -> 5;
            case 2 -> 3;
            case 3 -> 2;
            case 4 -> 1;
            default -> 0;
        };
    }

    private static Integer toInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String toStringValue(Object value) {
        return value == null ? null : value.toString();
    }

    private static int safeInt(Object value) {
        if (value == null) return 0;
        if (value instanceof Number number) return number.intValue();
        try {
            String raw = String.valueOf(value).trim();
            int dashIndex = raw.indexOf("-");
            if (dashIndex > 0) raw = raw.substring(0, dashIndex).trim();
            return Integer.parseInt(raw);
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static int clamp0to100(int value) {
        return Math.max(0, Math.min(100, value));
    }

    private static String truncate(String value) {
        if (value == null || value.isBlank()) return "";
        int maxLength = 1000;
        return value.length() <= maxLength ? value : value.substring(0, maxLength) + "...";
    }
}