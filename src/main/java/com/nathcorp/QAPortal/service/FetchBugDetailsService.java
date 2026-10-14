package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.BugDetailsResponse;
import com.nathcorp.QAPortal.dto.BugFeatureSummaryResponse;
import com.nathcorp.QAPortal.dto.BugItem;
import com.nathcorp.QAPortal.dto.ChangedBy;
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
import java.util.*;

@Service
public class FetchBugDetailsService {

    private final RestTemplate restTemplate;
    private final BugFeatureAiService bugFeatureAiService;
    private final OboTokenService oboTokenService;

    public FetchBugDetailsService(
            RestTemplate restTemplate,
            BugFeatureAiService bugFeatureAiService,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.bugFeatureAiService = bugFeatureAiService;
        this.oboTokenService = oboTokenService;
    }

    public BugDetailsResponse getBugDetails(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        String adoToken = getAdoTokenUsingObo(authorizationHeader);

        return getBugDetailsUsingAdoToken(
                adoToken,
                organization,
                project,
                tagName,
                buildName
        );
    }

    public BugFeatureSummaryResponse getAiTrends(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        BugDetailsResponse raw = getBugDetails(
                authorizationHeader,
                organization,
                project,
                tagName,
                buildName
        );

        List<BugItem> bugs =
                raw != null && raw.getValue() != null
                        ? raw.getValue()
                        : List.of();

        return bugFeatureAiService.summarizeByFeature(bugs);
    }

    public Map<String, Long> getSeverityCounts(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);

        validateInputs(organization, project);

        if (tagName == null || tagName.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "tagName is required"
            );
        }

        if (buildName == null || buildName.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "buildName is required"
            );
        }

        BugDetailsResponse response = getBugDetailsUsingAdoToken(
                adoToken,
                organization,
                project,
                tagName,
                buildName
        );

        long critical = 0;
        long high = 0;
        long medium = 0;
        long low = 0;

        List<BugItem> items =
                response == null || response.getValue() == null
                        ? Collections.emptyList()
                        : response.getValue();

        for (BugItem item : items) {
            if (item == null) {
                continue;
            }

            if (item.getState() == null || item.getState().equalsIgnoreCase("Closed")) {
                continue;
            }

            List<Tag> tags = item.getTags();

            boolean hasTagName = hasTag(tags, tagName);
            boolean hasBuildName = hasTag(tags, buildName);

            if (!hasTagName || !hasBuildName) {
                continue;
            }

            String rawSeverity = item.getSeverity();

            if (rawSeverity == null || rawSeverity.isBlank()) {
                continue;
            }

            String severity;

            int dash = rawSeverity.indexOf("-");

            if (dash >= 0 && dash + 1 < rawSeverity.length()) {
                severity = rawSeverity.substring(dash + 1).trim();
            } else {
                severity = rawSeverity.trim();
            }

            switch (severity.toLowerCase()) {
                case "critical" -> critical++;
                case "high" -> high++;
                case "medium" -> medium++;
                case "low" -> low++;
                default -> {
                    // ignore unknown severity
                }
            }
        }

        Map<String, Long> result = new LinkedHashMap<>();
        result.put("Critical", critical);
        result.put("High", high);
        result.put("Medium", medium);
        result.put("Low", low);

        return result;
    }

    public Map<String, Object> createBug(
            String authorizationHeader,
            String organization,
            String project,
            String title,
            String reproSteps,
            Integer priority,
            String severity,
            String assignedTo,
            String tags
    ) {
        String adoToken = getAdoTokenUsingObo(authorizationHeader);

        validateInputs(organization, project);

        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "title is required");
        }

        if (reproSteps == null || reproSteps.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reproSteps is required");
        }

        if (priority == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "priority is required");
        }

        if (severity == null || severity.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "severity is required");
        }

        if (assignedTo == null || assignedTo.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "assignedTo is required");
        }

        if (tags == null || tags.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "tags is required");
        }

        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://dev.azure.com/{org}/{project}/_apis/wit/workitems/$Bug")
                .queryParam("api-version", "7.1")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        List<Map<String, Object>> patch = new ArrayList<>();
        patch.add(patchAdd("/fields/System.Title", title));
        patch.add(patchAdd("/fields/Microsoft.VSTS.TCM.ReproSteps", toHtml(reproSteps)));
        patch.add(patchAdd("/fields/Microsoft.VSTS.Common.Priority", priority));
        patch.add(patchAdd("/fields/Microsoft.VSTS.Common.Severity", normalizeSeverity(severity)));
        patch.add(patchAdd("/fields/System.AssignedTo", assignedTo));
        patch.add(patchAdd("/fields/System.Tags", tags));

        HttpHeaders headers = buildAdoJsonHeaders(adoToken);
        headers.setContentType(MediaType.valueOf("application/json-patch+json"));

        HttpEntity<List<Map<String, Object>>> request =
                new HttpEntity<>(patch, headers);

        try {
            ResponseEntity<Map> response =
                    restTemplate.exchange(
                            uri,
                            HttpMethod.POST,
                            request,
                            Map.class
                    );

            Map body = response.getBody();

            if (body == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Azure DevOps returned empty response body"
                );
            }

            Object idObj = body.get("id");

            if (idObj == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Azure DevOps response does not contain work item id"
                );
            }

            int id =
                    idObj instanceof Number number
                            ? number.intValue()
                            : Integer.parseInt(String.valueOf(idObj));

            String uiUrl = UriComponentsBuilder
                    .fromHttpUrl("https://dev.azure.com/{org}/{project}/_workitems/edit/{id}")
                    .buildAndExpand(organization, project, id)
                    .encode()
                    .toUriString();

            String webUrl = extractWebUrl(body);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("url", webUrl != null && !webUrl.isBlank() ? webUrl : uiUrl);
            result.put("title", title);
            result.put("ok", true);

            return result;

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps create bug failed");

        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps create bug timed out.");
            return null;

        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to create Azure DevOps bug: " + e.getMessage(),
                    e
            );
        }
    }

    private BugDetailsResponse getBugDetailsUsingAdoToken(
            String adoToken,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        validateAdoToken(adoToken);
        validateInputs(organization, project);

        List<Integer> workItemIds = fetchBugIdsUsingWiql(
                adoToken,
                organization,
                project,
                tagName,
                buildName
        );

        if (workItemIds.isEmpty()) {
            BugDetailsResponse empty = new BugDetailsResponse();
            empty.setValue(List.of());
            return empty;
        }

        return fetchBugDetailsBatch(
                adoToken,
                organization,
                project,
                workItemIds
        );
    }

    private List<Integer> fetchBugIdsUsingWiql(
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
        body.put("query", buildBugWiql(project, tagName, buildName));

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

                Object idObj = item.get("id");
                Integer id = toInteger(idObj);

                if (id != null) {
                    ids.add(id);

                    if (ids.size() >= 200) {
                        break;
                    }
                }
            }

            return ids;

        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps WIQL bug query timed out.");
            return List.of();

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps WIQL bug query failed");
        }
    }

    private BugDetailsResponse fetchBugDetailsBatch(
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

            BugDetailsResponse result = new BugDetailsResponse();

            if (responseBody == null) {
                result.setValue(List.of());
                return result;
            }

            Object valueObj = responseBody.get("value");

            if (!(valueObj instanceof List<?> values)) {
                result.setValue(List.of());
                return result;
            }

            Map<Integer, BugItem> bugsById = new LinkedHashMap<>();

            for (Object valueItemObj : values) {
                if (!(valueItemObj instanceof Map<?, ?> valueItem)) {
                    continue;
                }

                BugItem bug = toBugItem(valueItem);

                if (bug.getWorkItemId() > 0) {
                    bugsById.put(bug.getWorkItemId(), bug);
                }
            }

            List<BugItem> orderedBugs = new ArrayList<>();

            for (Integer id : workItemIds) {
                BugItem bug = bugsById.get(id);

                if (bug != null) {
                    orderedBugs.add(bug);
                }
            }

            result.setValue(orderedBugs);
            return result;

        } catch (ResourceAccessException e) {
            handleResourceAccessException(e, "Azure DevOps work items batch call timed out.");
            return null;

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps work items batch call failed");
        }
    }

    private static String buildBugWiql(
            String project,
            String tagName,
            String buildName
    ) {
        StringBuilder wiql = new StringBuilder();

        wiql.append("SELECT [System.Id] FROM WorkItems ")
                .append("WHERE [System.TeamProject] = '")
                .append(escapeWiqlLiteral(project))
                .append("' AND [System.WorkItemType] = 'Bug'");

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

    private static BugItem toBugItem(Map<?, ?> valueItem) {
        BugItem bug = new BugItem();

        Integer id = toInteger(valueItem.get("id"));

        if (id != null) {
            bug.setWorkItemId(id);
        }

        Object fieldsObj = valueItem.get("fields");

        if (!(fieldsObj instanceof Map<?, ?> fields)) {
            return bug;
        }

        bug.setTitle(toStringValue(fields.get("System.Title")));
        bug.setState(toStringValue(fields.get("System.State")));
        bug.setSeverity(toStringValue(fields.get("Microsoft.VSTS.Common.Severity")));
        bug.setChangedDate(toStringValue(fields.get("System.ChangedDate")));
        bug.setAssignedTo(toUserInfo(fields.get("System.AssignedTo")));
        bug.setChangedBy(toChangedBy(fields.get("System.ChangedBy")));
        bug.setTags(toTags(fields.get("System.Tags")));

        return bug;
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

    private static boolean hasTag(List<Tag> tags, String expectedTagName) {
        if (expectedTagName == null || expectedTagName.isBlank()) {
            return true;
        }

        return tags != null &&
                tags.stream()
                        .filter(Objects::nonNull)
                        .anyMatch(t ->
                                t.getTagName() != null &&
                                        t.getTagName().equalsIgnoreCase(expectedTagName)
                        );
    }

    private static String requireBearerAuthorization(String authorizationHeader) {
        return AuthorizationUtils.requireBearerAuthorization(authorizationHeader);
    }

    private static void validateInputs(String organization, String project) {
        if (organization == null || organization.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "organization is required");
        }

        if (project == null || project.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "project is required");
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
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-TFS-FedAuthRedirect", "Suppress");
        headers.setBearerAuth(adoToken);
        return headers;
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

    private static Map<String, Object> patchAdd(String path, Object value) {
        Map<String, Object> op = new LinkedHashMap<>();
        op.put("op", "add");
        op.put("path", path);
        op.put("value", value);
        return op;
    }

    private static String toHtml(String text) {
        String escaped = text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br/>");

        return "<p>" + escaped + "</p>";
    }

    private static String normalizeSeverity(String input) {
        if (input == null) {
            return null;
        }

        String value = input.trim();
        String lower = value.toLowerCase();

        if (lower.matches("^\\d\\s*-\\s*.*")) {
            return value;
        }

        return switch (lower) {
            case "critical" -> "1 - Critical";
            case "high" -> "2 - High";
            case "medium" -> "3 - Medium";
            case "low" -> "4 - Low";
            default -> value;
        };
    }

    private static String extractWebUrl(Map body) {
        Object linksObj = body.get("_links");

        if (!(linksObj instanceof Map<?, ?> links)) {
            return null;
        }

        Object webObj = links.get("web");

        if (!(webObj instanceof Map<?, ?> web)) {
            return null;
        }

        Object href = web.get("href");

        return href != null ? href.toString() : null;
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