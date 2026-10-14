package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.RecentBugActivityResponse;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.SocketTimeoutException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class RecentBugActivityService {

    private final RestTemplate restTemplate;
    private final OboTokenService oboTokenService;

    public RecentBugActivityService(
            RestTemplate restTemplate,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.oboTokenService = oboTokenService;
    }

    public List<RecentBugActivityResponse> getRecentBugActivity(
            String authorizationHeader,
            String organization,
            String project
    ) {
        String adoToken = getAdoTokenUsingObo(authorizationHeader);

        validateInputs(organization, project);

        List<Integer> workItemIds = fetchRecentBugIdsUsingWiql(
                adoToken,
                organization,
                project
        );

        if (workItemIds.isEmpty()) {
            return List.of();
        }

        return fetchRecentBugDetailsBatch(
                adoToken,
                organization,
                project,
                workItemIds
        );
    }

    private List<Integer> fetchRecentBugIdsUsingWiql(
            String adoToken,
            String organization,
            String project
    ) {
        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{organization}/{project}/_apis/wit/wiql")
                .queryParam("api-version", "7.1")
                .queryParam("$top", "5")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        Map<String, String> body = new LinkedHashMap<>();
        body.put("query", buildRecentBugActivityWiql(project));

        HttpHeaders headers = buildAdoHeaders(adoToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    uri,
                    HttpMethod.POST,
                    request,
                    Map.class
            );

            Map responseBody = response.getBody();

            if (responseBody == null) {
                return List.of();
            }

            Object workItemsObj = responseBody.get("workItems");

            if (!(workItemsObj instanceof List<?> workItems)) {
                return List.of();
            }

            List<Integer> ids = new ArrayList<>();

            for (Object workItemObj : workItems) {
                if (!(workItemObj instanceof Map<?, ?> workItem)) {
                    continue;
                }

                Integer id = toInteger(workItem.get("id"));

                if (id != null) {
                    ids.add(id);
                }
            }

            return ids;

        } catch (ResourceAccessException e) {
            throw mapResourceAccessException(
                    e,
                    "Azure DevOps recent bug activity WIQL call timed out"
            );

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(
                    e,
                    "Azure DevOps recent bug activity WIQL call failed"
            );
        }
    }

    private List<RecentBugActivityResponse> fetchRecentBugDetailsBatch(
            String adoToken,
            String organization,
            String project,
            List<Integer> workItemIds
    ) {
        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{organization}/{project}/_apis/wit/workitemsbatch")
                .queryParam("api-version", "7.1")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ids", workItemIds);
        body.put("fields", List.of(
                "System.Id",
                "System.Title",
                "System.State",
                "System.ChangedDate",
                "System.AssignedTo"
        ));

        HttpHeaders headers = buildAdoHeaders(adoToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    uri,
                    HttpMethod.POST,
                    request,
                    Map.class
            );

            Map responseBody = response.getBody();

            if (responseBody == null) {
                return List.of();
            }

            Object valueObj = responseBody.get("value");

            if (!(valueObj instanceof List<?> values)) {
                return List.of();
            }

            Map<Integer, RecentBugActivityResponse> bugsById = new LinkedHashMap<>();

            for (Object valueItemObj : values) {
                if (!(valueItemObj instanceof Map<?, ?> valueItem)) {
                    continue;
                }

                RecentBugActivityResponse bug = toRecentBugActivityResponse(valueItem);

                if (bug.getWorkItemId() > 0) {
                    bugsById.put(bug.getWorkItemId(), bug);
                }
            }

            List<RecentBugActivityResponse> orderedBugs = new ArrayList<>();

            for (Integer id : workItemIds) {
                RecentBugActivityResponse bug = bugsById.get(id);

                if (bug != null) {
                    orderedBugs.add(bug);
                }
            }

            return orderedBugs;

        } catch (ResourceAccessException e) {
            throw mapResourceAccessException(
                    e,
                    "Azure DevOps recent bug activity batch call timed out"
            );

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(
                    e,
                    "Azure DevOps recent bug activity batch call failed"
            );
        }
    }

    private static String buildRecentBugActivityWiql(String project) {
        return "SELECT [System.Id] FROM WorkItems " +
                "WHERE [System.TeamProject] = '" + escapeWiqlLiteral(project) + "' " +
                "AND [System.WorkItemType] = 'Bug' " +
                "ORDER BY [System.ChangedDate] DESC";
    }

    private static RecentBugActivityResponse toRecentBugActivityResponse(Map<?, ?> valueItem) {
        RecentBugActivityResponse bug = new RecentBugActivityResponse();

        Integer id = toInteger(valueItem.get("id"));

        Object fieldsObj = valueItem.get("fields");

        if (fieldsObj instanceof Map<?, ?> fields) {
            Integer fieldId = toInteger(fields.get("System.Id"));

            if (fieldId != null) {
                id = fieldId;
            }

            bug.setTitle(toStringValue(fields.get("System.Title")));
            bug.setState(toStringValue(fields.get("System.State")));

            String changedDate = toStringValue(fields.get("System.ChangedDate"));

            if (changedDate != null && !changedDate.isBlank()) {
                bug.setChangedDate(OffsetDateTime.parse(changedDate));
            }

            bug.setAssignedTo(toAssignedToName(fields.get("System.AssignedTo")));
        }

        if (id != null) {
            bug.setWorkItemId(id);
        }

        return bug;
    }

    private static String toAssignedToName(Object assignedToObj) {
        if (!(assignedToObj instanceof Map<?, ?> assignedTo)) {
            return null;
        }

        String displayName = toStringValue(assignedTo.get("displayName"));

        if (displayName != null && !displayName.isBlank()) {
            return displayName;
        }

        return toStringValue(assignedTo.get("uniqueName"));
    }

    private String getAdoTokenUsingObo(String authorizationHeader) {
        String validAuthorizationHeader = requireBearerAuthorization(authorizationHeader);

        String adoToken = oboTokenService.getAdoAccessToken(validAuthorizationHeader);

        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        return adoToken;
    }

    private static String requireBearerAuthorization(String authorizationHeader) {
        return AuthorizationUtils.requireBearerAuthorization(authorizationHeader);
    }

    private static void validateInputs(String organization, String project) {
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

    private static HttpHeaders buildAdoHeaders(String adoToken) {
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

    private static Integer toInteger(Object value) {
        if (value == null) {
            return null;
        }

        if (value instanceof Number number) {
            return number.intValue();
        }

        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String toStringValue(Object value) {
        return value == null ? null : value.toString();
    }

    private static String escapeWiqlLiteral(String value) {
        return value == null ? "" : value.replace("'", "''");
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

    private static ResponseStatusException mapResourceAccessException(
            ResourceAccessException e,
            String timeoutMessage
    ) {
        Throwable root = e.getMostSpecificCause();

        if (root instanceof SocketTimeoutException) {
            return new ResponseStatusException(
                    HttpStatus.GATEWAY_TIMEOUT,
                    timeoutMessage,
                    e
            );
        }

        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Azure DevOps network error: " + e.getMessage(),
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
}
