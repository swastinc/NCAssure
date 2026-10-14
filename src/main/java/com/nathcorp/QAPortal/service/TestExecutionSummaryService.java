package com.nathcorp.QAPortal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nathcorp.QAPortal.dto.PieChartTestExecutionSummaryDto;
import com.nathcorp.QAPortal.dto.TestExecutionDto;
import com.nathcorp.QAPortal.dto.TestExecutionResponse;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class TestExecutionSummaryService {

    private final RestTemplate restTemplate;
    private final ObjectMapper mapper;
    private final OboTokenService oboTokenService;

    public TestExecutionSummaryService(
            RestTemplate restTemplate,
            ObjectMapper mapper,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.mapper = mapper;
        this.oboTokenService = oboTokenService;
    }

    public byte[] generateExecutionCsv(List<TestExecutionDto> executions) {
        StringBuilder csv = new StringBuilder();
        csv.append("Test Case ID,Test Case Title,Outcome,Run By,Completed Date\n");

        List<TestExecutionDto> safeExecutions =
                executions == null ? List.of() : executions;

        for (TestExecutionDto exec : safeExecutions) {
            if (exec == null) {
                continue;
            }

            csv.append(exec.getTestCaseId()).append(",");
            csv.append("\"").append(escapeCsv(exec.getTestCaseTitle())).append("\",");
            csv.append(escapeCsv(exec.getOutcome())).append(",");
            csv.append("\"").append(escapeCsv(exec.getRunBy())).append("\",");
            csv.append(exec.getCompletedDate()).append("\n");
        }

        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    public TestExecutionResponse getLatestExecutions(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        validateInputs(authorizationHeader, organization, project);

        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);

        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        HttpHeaders headers = buildHeaders(adoToken);
        HttpEntity<Void> request = new HttpEntity<>(headers);

        try {
            URI runsUri = UriComponentsBuilder
                    .fromHttpUrl("https://dev.azure.com/{organization}/{project}/_apis/test/runs")
                    .queryParam("api-version", "7.1")
                    .buildAndExpand(organization, project)
                    .encode()
                    .toUri();

            ResponseEntity<String> runsResponse =
                    restTemplate.exchange(
                            runsUri,
                            HttpMethod.GET,
                            request,
                            String.class
                    );

            JsonNode runsRoot = mapper.readTree(runsResponse.getBody());
            JsonNode runs = runsRoot.path("value");

            if (!runs.isArray()) {
                return new TestExecutionResponse(List.of());
            }

            Map<Integer, TestExecutionDto> latestResults =
                    new ConcurrentHashMap<>();

            List<JsonNode> runList = new ArrayList<>();
            runs.forEach(runList::add);

            ExecutorService executor = Executors.newFixedThreadPool(10);

            try {
                List<CompletableFuture<Void>> futures = runList.stream()
                        .map(run -> CompletableFuture.runAsync(() -> {
                            try {
                                processRunResults(
                                        run,
                                        organization,
                                        project,
                                        request,
                                        latestResults
                                );
                            } catch (Exception ex) {
                                System.err.println(
                                        "[TestExecutionSummaryService] Error processing run: "
                                                + ex.getMessage()
                                );
                            }
                        }, executor))
                        .toList();

                CompletableFuture.allOf(
                        futures.toArray(new CompletableFuture[0])
                ).join();

            } finally {
                executor.shutdown();
            }

            boolean hasTagFilter = hasAnyTagFilter(tagName, buildName);

            Set<Integer> taggedIds =
                    fetchTaggedTestCases(
                            organization,
                            project,
                            tagName,
                            buildName,
                            headers
                    );

            List<TestExecutionDto> finalResults =
                    latestResults.values()
                            .stream()
                            .filter(result ->
                                    !hasTagFilter ||
                                            taggedIds.contains(result.getTestCaseId())
                            )
                            .sorted(Comparator.comparing(TestExecutionDto::getTestCaseId))
                            .toList();

            return new TestExecutionResponse(finalResults);

        } catch (ResourceAccessException e) {
            Throwable root = e.getMostSpecificCause();

            if (root instanceof SocketTimeoutException) {
                throw new ResponseStatusException(
                        HttpStatus.GATEWAY_TIMEOUT,
                        "Azure DevOps test execution call timed out",
                        e
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Azure DevOps network error",
                    e
            );

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(
                    e,
                    "Azure DevOps test execution API failed"
            );

        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Error processing test execution data",
                    e
            );
        }
    }

    private void processRunResults(
            JsonNode run,
            String organization,
            String project,
            HttpEntity<Void> request,
            Map<Integer, TestExecutionDto> latestResults
    ) throws Exception {
        if (run == null || !run.hasNonNull("id")) {
            return;
        }

        int runId = run.get("id").asInt();

        URI resultsUri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{organization}/{project}/_apis/test/Runs/{runId}/results")
                .queryParam("api-version", "7.1")
                .buildAndExpand(organization, project, runId)
                .encode()
                .toUri();

        ResponseEntity<String> resultsResponse =
                restTemplate.exchange(
                        resultsUri,
                        HttpMethod.GET,
                        request,
                        String.class
                );

        JsonNode resultsRoot = mapper.readTree(resultsResponse.getBody());
        JsonNode results = resultsRoot.path("value");

        if (!results.isArray()) {
            return;
        }

        for (JsonNode result : results) {
            JsonNode testCaseNode = result.path("testCase");

            if (testCaseNode.isMissingNode()) {
                continue;
            }

            JsonNode idNode = testCaseNode.get("id");
            JsonNode completedNode = result.get("completedDate");
            JsonNode outcomeNode = result.get("outcome");

            if (idNode == null || completedNode == null || outcomeNode == null) {
                continue;
            }

            int testCaseId = idNode.asInt();

            OffsetDateTime completedDate =
                    OffsetDateTime.parse(completedNode.asText());

            TestExecutionDto dto = new TestExecutionDto();
            dto.setTestCaseId(testCaseId);
            dto.setTestCaseTitle(testCaseNode.path("name").asText("N/A"));
            dto.setOutcome(outcomeNode.asText());
            dto.setCompletedDate(completedDate);

            JsonNode runByNode = result.path("runBy");

            if (!runByNode.isMissingNode()) {
                dto.setRunBy(
                        runByNode.path("displayName").asText(
                                runByNode.path("uniqueName").asText("")
                        )
                );
            }

            latestResults.merge(
                    testCaseId,
                    dto,
                    (oldValue, newValue) ->
                            newValue.getCompletedDate().isAfter(oldValue.getCompletedDate())
                                    ? newValue
                                    : oldValue
            );
        }
    }

    public List<PieChartTestExecutionSummaryDto> getLatestExecutionSummary(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        TestExecutionResponse fullResponse =
                getLatestExecutions(
                        authorizationHeader,
                        organization,
                        project,
                        tagName,
                        buildName
                );

        List<TestExecutionDto> executions =
                fullResponse == null || fullResponse.getExecutions() == null
                        ? List.of()
                        : fullResponse.getExecutions();

        return executions.stream()
                .map(e -> new PieChartTestExecutionSummaryDto(
                        e.getTestCaseId(),
                        e.getOutcome()
                ))
                .toList();
    }

    private Set<Integer> fetchTaggedTestCases(
            String organization,
            String project,
            String tagName,
            String buildName,
            HttpHeaders baseHeaders
    ) throws Exception {
        if (!hasAnyTagFilter(tagName, buildName)) {
            return Set.of();
        }

        URI wiqlUri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{organization}/{project}/_apis/wit/wiql")
                .queryParam("api-version", "7.1")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        StringBuilder wiqlQuery = new StringBuilder();

        wiqlQuery.append("""
                SELECT [System.Id]
                FROM WorkItems
                WHERE [System.WorkItemType] = 'Test Case'
                """);

        if (tagName != null && !tagName.isBlank()) {
            wiqlQuery
                    .append(" AND [System.Tags] CONTAINS '")
                    .append(escapeWiqlValue(tagName))
                    .append("'");
        }

        if (buildName != null && !buildName.isBlank()) {
            wiqlQuery
                    .append(" AND [System.Tags] CONTAINS '")
                    .append(escapeWiqlValue(buildName))
                    .append("'");
        }

        String wiqlBody =
                mapper.createObjectNode()
                        .put("query", wiqlQuery.toString().replace("\n", " ").trim())
                        .toString();

        HttpHeaders headers = new HttpHeaders();
        headers.putAll(baseHeaders);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<String> request = new HttpEntity<>(wiqlBody, headers);

        ResponseEntity<String> response =
                restTemplate.exchange(
                        wiqlUri,
                        HttpMethod.POST,
                        request,
                        String.class
                );

        JsonNode root = mapper.readTree(response.getBody());
        JsonNode items = root.path("workItems");

        Set<Integer> ids = new HashSet<>();

        if (items.isArray()) {
            for (JsonNode item : items) {
                if (item.hasNonNull("id")) {
                    ids.add(item.get("id").asInt());
                }
            }
        }

        return ids;
    }

    private static boolean hasAnyTagFilter(
            String tagName,
            String buildName
    ) {
        return tagName != null && !tagName.isBlank()
                || buildName != null && !buildName.isBlank();
    }

    private static String escapeWiqlValue(String value) {
        return value == null ? "" : value.replace("'", "''");
    }

    private HttpHeaders buildHeaders(String adoToken) {
        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Azure DevOps token is required"
            );
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-TFS-FedAuthRedirect", "Suppress");
        headers.setBearerAuth(adoToken);

        return headers;
    }

    private static void validateInputs(
            String authorizationHeader,
            String organization,
            String project
    ) {
        requireBearerAuthorization(authorizationHeader);

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

    private static String requireBearerAuthorization(String authorizationHeader) {
        return AuthorizationUtils.requireBearerAuthorization(authorizationHeader);
    }

    private static ResponseStatusException mapAdoHttpException(
            HttpStatusCodeException e,
            String message
    ) {
        String contentType =
                e.getResponseHeaders() != null &&
                        e.getResponseHeaders().getContentType() != null
                        ? e.getResponseHeaders().getContentType().toString()
                        : "unknown";

        String body = e.getResponseBodyAsString();

        System.err.println("[TestExecutionSummaryService] ADO status = " + e.getStatusCode());
        System.err.println("[TestExecutionSummaryService] ADO content-type = " + contentType);
        System.err.println("[TestExecutionSummaryService] ADO body = " + truncate(body));

        if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
            return new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    message + ": Azure DevOps rejected the token. User may need consent or Azure DevOps access.",
                    e
            );
        }

        if (e.getStatusCode() == HttpStatus.FORBIDDEN) {
            return new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    message + ": User does not have permission in Azure DevOps.",
                    e
            );
        }

        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                message + ": " + e.getStatusCode() + " content-type=" + contentType,
                e
        );
    }

    private static String truncate(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }

        int maxLength = 1000;

        if (value.length() <= maxLength) {
            return value;
        }

        return value.substring(0, maxLength) + "...";
    }

    private static String escapeCsv(String value) {
        if (value == null) {
            return "";
        }

        return value.replace("\"", "\"\"");
    }
}