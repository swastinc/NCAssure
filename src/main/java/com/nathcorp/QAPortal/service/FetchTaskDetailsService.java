package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.ChangedBy;
import com.nathcorp.QAPortal.dto.Tag;
import com.nathcorp.QAPortal.dto.TaskDetailsResponse;
import com.nathcorp.QAPortal.dto.TaskItem;
import com.nathcorp.QAPortal.dto.UserInfo;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class FetchTaskDetailsService {

    private final RestTemplate restTemplate;
    private final OboTokenService oboTokenService;

    public FetchTaskDetailsService(
            RestTemplate restTemplate,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.oboTokenService = oboTokenService;
    }

    public TaskDetailsResponse getTaskDetails(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        String adoToken = getAdoTokenUsingObo(authorizationHeader);

        validateInputs(organization, project);

        List<Integer> workItemIds = fetchTaskIdsUsingWiql(
                adoToken,
                organization,
                project,
                tagName,
                buildName
        );

        if (workItemIds.isEmpty()) {
            TaskDetailsResponse empty = new TaskDetailsResponse();
            empty.setValue(List.of());
            return empty;
        }

        return fetchTaskDetailsBatch(
                adoToken,
                organization,
                project,
                workItemIds
        );
    }

    private List<Integer> fetchTaskIdsUsingWiql(
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
        body.put("query", buildTaskWiql(project, tagName, buildName));

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
            handleResourceAccessException(
                    e,
                    "Azure DevOps WIQL task query timed out."
            );
            return List.of();

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(
                    e,
                    "Azure DevOps WIQL task query failed"
            );
        }
    }

    private TaskDetailsResponse fetchTaskDetailsBatch(
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
                "Microsoft.VSTS.Common.Severity",
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
            TaskDetailsResponse result = new TaskDetailsResponse();

            if (responseBody == null) {
                result.setValue(List.of());
                return result;
            }

            Object valueObj = responseBody.get("value");

            if (!(valueObj instanceof List<?> values)) {
                result.setValue(List.of());
                return result;
            }

            Map<Integer, TaskItem> tasksById = new LinkedHashMap<>();

            for (Object valueItemObj : values) {
                if (!(valueItemObj instanceof Map<?, ?> valueItem)) {
                    continue;
                }

                TaskItem task = toTaskItem(valueItem);

                if (task.getWorkItemId() > 0) {
                    tasksById.put(task.getWorkItemId(), task);
                }
            }

            List<TaskItem> orderedTasks = new ArrayList<>();

            for (Integer id : workItemIds) {
                TaskItem task = tasksById.get(id);

                if (task != null) {
                    orderedTasks.add(task);
                }
            }

            result.setValue(orderedTasks);
            return result;

        } catch (ResourceAccessException e) {
            handleResourceAccessException(
                    e,
                    "Azure DevOps task work items batch call timed out."
            );
            return null;

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(
                    e,
                    "Azure DevOps task work items batch call failed"
            );
        }
    }

    private static String buildTaskWiql(
            String project,
            String tagName,
            String buildName
    ) {
        StringBuilder wiql = new StringBuilder();

        wiql.append("SELECT [System.Id] FROM WorkItems ")
                .append("WHERE [System.TeamProject] = '")
                .append(escapeWiqlLiteral(project))
                .append("' AND [System.WorkItemType] = 'Task'");

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

    private static TaskItem toTaskItem(Map<?, ?> valueItem) {
        TaskItem task = new TaskItem();

        Integer id = toInteger(valueItem.get("id"));

        if (id != null) {
            task.setWorkItemId(id);
        }

        Object fieldsObj = valueItem.get("fields");

        if (!(fieldsObj instanceof Map<?, ?> fields)) {
            return task;
        }

        task.setTitle(toStringValue(fields.get("System.Title")));
        task.setState(toStringValue(fields.get("System.State")));
        task.setAssignedTo(toUserInfo(fields.get("System.AssignedTo")));
        task.setChangedBy(toChangedBy(fields.get("System.ChangedBy")));
        task.setChangedDate(toStringValue(fields.get("System.ChangedDate")));
        task.setSeverity(toStringValue(fields.get("Microsoft.VSTS.Common.Severity")));
        task.setTags(toTags(fields.get("System.Tags")));

        return task;
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
        AuthorizationUtils.requireBearerAuthorization(authorizationHeader);

        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);

        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        return adoToken;
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
