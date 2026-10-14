package com.nathcorp.QAPortal.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.nathcorp.QAPortal.dto.DailyBugStatsResponse;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.SocketTimeoutException;
import java.net.URI;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class BugAnalyticsService {

    private final RestTemplate restTemplate;
    private final OboTokenService oboTokenService;
    private final DateTimeFormatter isoFormatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    public BugAnalyticsService(RestTemplate restTemplate, OboTokenService oboTokenService) {
        this.restTemplate = restTemplate;
        this.oboTokenService = oboTokenService;
    }

    public DailyBugStatsResponse getDailyBugStats(
            String authorizationHeader,
            String organization,
            String project,
            String startDate,
            String endDate,
            String tagName
    ) {
        requireBearerAuthorization(authorizationHeader);
        validateInputs(organization, project, startDate, endDate);

        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);
        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        // Formatted dates with time boundaries for in-memory Java calculations
        String formattedStart = startDate + "T00:00:00Z";
        String formattedEnd = endDate + "T23:59:59Z";

        try {
            // Step 1: Execute WIQL using raw YYYY-MM-DD dates (Azure DevOps date precision requirement)
            List<Integer> workItemIds = executeWiqlQuery(
                    organization, project, adoToken, startDate, endDate, tagName
            );

            // Step 2: Fetch Work Item details in batches of 200
            List<AdoWorkItem> allWorkItems = new ArrayList<>();
            if (!workItemIds.isEmpty()) {
                allWorkItems = fetchWorkItemDetails(organization, project, adoToken, workItemIds);
            }

            // Step 3: Process dates and calculate daily stats
            Map<LocalDate, long[]> dailyStats = getBugCountsInRange(allWorkItems, formattedStart, formattedEnd);

            List<DailyBugStatsResponse.DailyCount> values = new ArrayList<>();
            for (Map.Entry<LocalDate, long[]> entry : dailyStats.entrySet()) {
                DailyBugStatsResponse.DailyCount daily = new DailyBugStatsResponse.DailyCount();
                daily.setDate(
                        entry.getKey().atStartOfDay().atOffset(ZoneOffset.UTC).format(isoFormatter)
                );
                daily.setCreatedCount(entry.getValue()[0]);
                daily.setResolvedCount(entry.getValue()[1]);
                daily.setClosedCount(entry.getValue()[2]);
                values.add(daily);
            }

            DailyBugStatsResponse finalResponse = new DailyBugStatsResponse();
            finalResponse.setValue(values);
            return finalResponse;

        } catch (ResourceAccessException e) {
            Throwable root = e.getMostSpecificCause();
            if (root instanceof SocketTimeoutException) {
                throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "Azure DevOps REST API call timed out", e);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Azure DevOps network error: " + e.getMessage(), e);
        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps REST API call failed");
        }
    }

    private List<Integer> executeWiqlQuery(
            String organization, String project, String adoToken,
            String startDate, String endDate, String tagName
    ) {
        String baseUrl = String.format("https://dev.azure.com/%s/%s/_apis/wit/wiql?api-version=7.1", organization, project);

        StringBuilder query = new StringBuilder("SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug'");

        if (tagName != null && !tagName.isBlank()) {
            query.append(" AND [System.Tags] CONTAINS '").append(tagName.replace("'", "''")).append("'");
        }

        // Pass standard YYYY-MM-DD string format to respect Azure DevOps date precision requirements
        query.append(" AND (")
                .append("([System.CreatedDate] >= '").append(startDate).append("' AND [System.CreatedDate] <= '").append(endDate).append("') OR ")
                .append("([Microsoft.VSTS.Common.ResolvedDate] >= '").append(startDate).append("' AND [Microsoft.VSTS.Common.ResolvedDate] <= '").append(endDate).append("') OR ")
                .append("([Microsoft.VSTS.Common.ClosedDate] >= '").append(startDate).append("' AND [Microsoft.VSTS.Common.ClosedDate] <= '").append(endDate).append("')")
                .append(")");

        HttpHeaders headers = buildAdoHeaders(adoToken);
        Map<String, String> body = Map.of("query", query.toString());
        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

        ResponseEntity<WiqlResponse> response = restTemplate.exchange(
                baseUrl, HttpMethod.POST, request, WiqlResponse.class
        );

        if (response.getBody() == null || response.getBody().getWorkItems() == null) {
            return List.of();
        }

        return response.getBody().getWorkItems().stream()
                .map(WiqlResponse.WorkItemReference::getId)
                .collect(Collectors.toList());
    }

    private List<AdoWorkItem> fetchWorkItemDetails(
            String organization, String project, String adoToken, List<Integer> workItemIds
    ) {
        List<AdoWorkItem> allWorkItems = new ArrayList<>();
        int batchSize = 200; // ADO REST API restricts IDs to 200 per request

        for (int i = 0; i < workItemIds.size(); i += batchSize) {
            List<Integer> batch = workItemIds.subList(i, Math.min(i + batchSize, workItemIds.size()));
            String idsParam = batch.stream().map(String::valueOf).collect(Collectors.joining(","));
            String fieldsParam = "System.Id,System.Title,System.State,System.CreatedDate,Microsoft.VSTS.Common.ResolvedDate,Microsoft.VSTS.Common.ClosedDate";

            URI uri = UriComponentsBuilder
                    .fromHttpUrl(String.format("https://dev.azure.com/%s/%s/_apis/wit/workitems", organization, project))
                    .queryParam("ids", idsParam)
                    .queryParam("fields", fieldsParam)
                    .queryParam("api-version", "7.1")
                    .build().encode().toUri();

            HttpEntity<Void> request = new HttpEntity<>(buildAdoHeaders(adoToken));
            ResponseEntity<WorkItemListResponse> response = restTemplate.exchange(
                    uri, HttpMethod.GET, request, WorkItemListResponse.class
            );

            if (response.getBody() != null && response.getBody().getValue() != null) {
                allWorkItems.addAll(response.getBody().getValue());
            }
        }
        return allWorkItems;
    }

    private Map<LocalDate, long[]> getBugCountsInRange(
            List<AdoWorkItem> items, String formattedStart, String formattedEnd
    ) {
        LocalDate start = OffsetDateTime.parse(formattedStart).toLocalDate();
        LocalDate end = OffsetDateTime.parse(formattedEnd).toLocalDate();
        Map<LocalDate, long[]> dailyStats = new LinkedHashMap<>();

        for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
            dailyStats.put(date, new long[]{0L, 0L, 0L});
        }

        if (items == null || items.isEmpty()) return dailyStats;

        for (AdoWorkItem item : items) {
            if (item == null || item.getFields() == null) continue;

            LocalDate createdDate = parseDate(item.getFields().getCreatedDate());
            LocalDate resolvedDate = parseDate(item.getFields().getResolvedDate());
            LocalDate closedDate = parseDate(item.getFields().getClosedDate());

            if (createdDate != null && !createdDate.isBefore(start) && !createdDate.isAfter(end)) {
                dailyStats.get(createdDate)[0]++;
            }

            if (closedDate != null && !closedDate.isBefore(start) && !closedDate.isAfter(end)) {
                dailyStats.get(closedDate)[2]++;
            }

            if (resolvedDate != null && !resolvedDate.isBefore(start) && !resolvedDate.isAfter(end)) {
                if (closedDate == null || !resolvedDate.equals(closedDate)) {
                    dailyStats.get(resolvedDate)[1]++;
                }
            }
        }
        return dailyStats;
    }

    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return OffsetDateTime.parse(value).toLocalDate();
        } catch (Exception ex) {
            return null;
        }
    }

    private static void validateInputs(String organization, String project, String startDate, String endDate) {
        if (organization == null || organization.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "organization is required");
        if (project == null || project.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "project is required");
        if (startDate == null || startDate.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startDate is required");
        if (endDate == null || endDate.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endDate is required");
    }

    private static String requireBearerAuthorization(String authorizationHeader) {
        return AuthorizationUtils.requireBearerAuthorization(authorizationHeader);
    }

    private static HttpHeaders buildAdoHeaders(String adoToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-TFS-FedAuthRedirect", "Suppress");
        headers.setBearerAuth(adoToken);
        return headers;
    }

    private static ResponseStatusException mapAdoHttpException(HttpStatusCodeException e, String message) {
        String contentType = e.getResponseHeaders() != null && e.getResponseHeaders().getContentType() != null
                ? e.getResponseHeaders().getContentType().toString() : "unknown";
        String body = truncate(e.getResponseBodyAsString());


        if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
            return new ResponseStatusException(HttpStatus.UNAUTHORIZED, message + ": Azure DevOps rejected the token.", e);
        }
        if (e.getStatusCode() == HttpStatus.FORBIDDEN) {
            return new ResponseStatusException(HttpStatus.FORBIDDEN, message + ": User lacks permission in Azure DevOps.", e);
        }
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, message + ": " + e.getStatusCode(), e);
    }

    private static String truncate(String value) {
        if (value == null || value.isBlank()) return "";
        int maxLength = 1000;
        return value.length() <= maxLength ? value : value.substring(0, maxLength) + "...";
    }

    // --- Inner Classes for ADO REST API Responses ---

    public static class WiqlResponse {
        private List<WorkItemReference> workItems;
        public List<WorkItemReference> getWorkItems() { return workItems; }
        public void setWorkItems(List<WorkItemReference> workItems) { this.workItems = workItems; }

        public static class WorkItemReference {
            private Integer id;
            public Integer getId() { return id; }
            public void setId(Integer id) { this.id = id; }
        }
    }

    public static class WorkItemListResponse {
        private List<AdoWorkItem> value;
        public List<AdoWorkItem> getValue() { return value; }
        public void setValue(List<AdoWorkItem> value) { this.value = value; }
    }

    public static class AdoWorkItem {
        private Integer id;
        private AdoWorkItemFields fields;
        public Integer getId() { return id; }
        public void setId(Integer id) { this.id = id; }
        public AdoWorkItemFields getFields() { return fields; }
        public void setFields(AdoWorkItemFields fields) { this.fields = fields; }
    }

    public static class AdoWorkItemFields {
        @JsonProperty("System.Title")
        private String title;

        @JsonProperty("System.State")
        private String state;

        @JsonProperty("System.CreatedDate")
        private String createdDate;

        @JsonProperty("Microsoft.VSTS.Common.ResolvedDate")
        private String resolvedDate;

        @JsonProperty("Microsoft.VSTS.Common.ClosedDate")
        private String closedDate;

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getState() { return state; }
        public void setState(String state) { this.state = state; }
        public String getCreatedDate() { return createdDate; }
        public void setCreatedDate(String createdDate) { this.createdDate = createdDate; }
        public String getResolvedDate() { return resolvedDate; }
        public void setResolvedDate(String resolvedDate) { this.resolvedDate = resolvedDate; }
        public String getClosedDate() { return closedDate; }
        public void setClosedDate(String closedDate) { this.closedDate = closedDate; }
    }
}