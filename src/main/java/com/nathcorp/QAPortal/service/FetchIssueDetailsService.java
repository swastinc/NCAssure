package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.ChangedBy;
import com.nathcorp.QAPortal.dto.IssueDetailsResponse;
import com.nathcorp.QAPortal.dto.IssueItem;
import com.nathcorp.QAPortal.dto.Tag;
import com.nathcorp.QAPortal.dto.UserInfo;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class FetchIssueDetailsService {

    private final RestTemplate restTemplate;
    private final OboTokenService oboTokenService;

    public FetchIssueDetailsService(
            RestTemplate restTemplate,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.oboTokenService = oboTokenService;
    }

    public IssueDetailsResponse getIssueDetails(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        String adoToken = getAdoTokenUsingObo(authorizationHeader);

        return getIssueDetailsUsingAdoToken(
                adoToken,
                organization,
                project,
                tagName,
                buildName
        );
    }

    private IssueDetailsResponse getIssueDetailsUsingAdoToken(
            String adoToken,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        validateAdoToken(adoToken);
        validateInputs(organization, project);

        List<Integer> workItemIds = fetchIssueIdsUsingWiql(
                adoToken,
                organization,
                project,
                tagName,
                buildName
        );

        if (workItemIds.isEmpty()) {
            IssueDetailsResponse empty = new IssueDetailsResponse();
            empty.setValue(List.of());
            return empty;
        }

        return fetchIssueDetailsBatch(
                adoToken,
                organization,
                project,
                workItemIds
        );
    }

    private List<Integer> fetchIssueIdsUsingWiql(
            String adoToken,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{org}/{project}/_apis/wit/wiql")
                .queryParam("api-version", "7.1")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        Map<String, String> body = new LinkedHashMap<>();
        body.put("query", buildIssueWiql(project, tagName, buildName));

        HttpHeaders headers = buildAdoJsonHeaders(adoToken);
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

            for (Object itemObj : workItems) {
                if (!(itemObj instanceof Map<?, ?> item)) {
                    continue;
                }

                Integer id = toInteger(item.get("id"));

                if (id != null) {
                    ids.add(id);

                    if (ids.size() >= 200) {
                        break;
                    }
                }
            }

            return ids;

        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps WIQL issue query timed out.");
            return List.of();

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps WIQL issue query failed");
        }
    }

    private IssueDetailsResponse fetchIssueDetailsBatch(
            String adoToken,
            String organization,
            String project,
            List<Integer> workItemIds
    ) {
        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{org}/{project}/_apis/wit/workitemsbatch")
                .queryParam("api-version", "7.1")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ids", workItemIds);
        body.put("fields", List.of(
                "System.Title",
                "System.State",
                "System.AssignedTo",
                "System.ChangedBy",
                "System.ChangedDate",
                "System.Tags"
        ));

        HttpHeaders headers = buildAdoJsonHeaders(adoToken);
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

            IssueDetailsResponse result = new IssueDetailsResponse();

            if (responseBody == null) {
                result.setValue(List.of());
                return result;
            }

            Object valueObj = responseBody.get("value");

            if (!(valueObj instanceof List<?> values)) {
                result.setValue(List.of());
                return result;
            }

            Map<Integer, IssueItem> issuesById = new LinkedHashMap<>();

            for (Object valueItemObj : values) {
                if (!(valueItemObj instanceof Map<?, ?> valueItem)) {
                    continue;
                }

                IssueItem issue = toIssueItem(valueItem);

                if (issue.getWorkItemId() > 0) {
                    issuesById.put(issue.getWorkItemId(), issue);
                }
            }

            List<IssueItem> orderedIssues = new ArrayList<>();

            for (Integer id : workItemIds) {
                IssueItem issue = issuesById.get(id);

                if (issue != null) {
                    orderedIssues.add(issue);
                }
            }

            result.setValue(orderedIssues);
            return result;

        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps work items batch call timed out.");
            return null;

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps work items batch call failed");
        }
    }

    private static String buildIssueWiql(
            String project,
            String tagName,
            String buildName
    ) {
        StringBuilder wiql = new StringBuilder();

        wiql.append("SELECT [System.Id] FROM WorkItems ")
                .append("WHERE [System.TeamProject] = '")
                .append(escapeWiqlLiteral(project))
                .append("' AND [System.WorkItemType] = 'Issue'");

        appendWiqlTagCondition(wiql, tagName);
        appendWiqlTagCondition(wiql, buildName);

        wiql.append(" ORDER BY [System.ChangedDate] DESC");

        return wiql.toString();
    }

    private static void appendWiqlTagCondition(StringBuilder wiql, String tagName) {
        if (tagName == null || tagName.isBlank()) {
            return;
        }

        wiql.append(" AND [System.Tags] CONTAINS '")
                .append(escapeWiqlLiteral(tagName.trim()))
                .append("'");
    }

    private static IssueItem toIssueItem(Map<?, ?> valueItem) {
        IssueItem issue = new IssueItem();

        Integer id = toInteger(valueItem.get("id"));

        if (id != null) {
            issue.setWorkItemId(id);
        }

        Object fieldsObj = valueItem.get("fields");

        if (!(fieldsObj instanceof Map<?, ?> fields)) {
            return issue;
        }

        issue.setTitle(toStringValue(fields.get("System.Title")));
        issue.setState(toStringValue(fields.get("System.State")));
        issue.setChangedDate(toStringValue(fields.get("System.ChangedDate")));
        issue.setAssignedTo(toUserInfo(fields.get("System.AssignedTo")));
        issue.setChangedBy(toChangedBy(fields.get("System.ChangedBy")));
        issue.setTags(toTags(fields.get("System.Tags")));

        return issue;
    }

    private static UserInfo toUserInfo(Object identityObj) {
        if (!(identityObj instanceof Map<?, ?> identity)) {
            return null;
        }

        UserInfo userInfo = new UserInfo();
        userInfo.setUserName(toStringValue(identity.get("displayName")));
        userInfo.setUserEmail(toStringValue(identity.get("uniqueName")));

        return userInfo;
    }

    private static ChangedBy toChangedBy(Object identityObj) {
        if (!(identityObj instanceof Map<?, ?> identity)) {
            return null;
        }

        ChangedBy changedBy = new ChangedBy();
        changedBy.setUserName(toStringValue(identity.get("displayName")));
        changedBy.setUserEmail(toStringValue(identity.get("uniqueName")));

        return changedBy;
    }

    private static List<Tag> toTags(Object tagsObj) {
        String rawTags = toStringValue(tagsObj);

        if (rawTags == null || rawTags.isBlank()) {
            return List.of();
        }

        List<Tag> tags = new ArrayList<>();

        for (String rawTag : rawTags.split(";")) {
            String tagName = rawTag == null ? "" : rawTag.trim();

            if (tagName.isBlank()) {
                continue;
            }

            Tag tag = new Tag();
            tag.setTagName(tagName);
            tags.add(tag);
        }

        return tags;
    }

    private String getAdoTokenUsingObo(String authorizationHeader) {
        requireBearerAuthorization(authorizationHeader);

        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);

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

    private static void validateAdoToken(String adoToken) {
        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Azure DevOps token is required. The backend must acquire it through OBO before calling this service."
            );
        }
    }

    private static HttpHeaders buildAdoJsonHeaders(String adoToken) {
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
                    HttpStatus.FORBIDDEN,
                    message + ": Azure DevOps rejected the token. User may need consent or a valid Azure DevOps license/access.",
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

    private static void handleResourceAccessException(
            ResourceAccessException e,
            String timeoutMessage
    ) {
        Throwable root = e.getMostSpecificCause();

        if (root instanceof SocketTimeoutException) {
            throw new ResponseStatusException(
                    HttpStatus.GATEWAY_TIMEOUT,
                    timeoutMessage,
                    e
            );
        }

        throw new ResponseStatusException(
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