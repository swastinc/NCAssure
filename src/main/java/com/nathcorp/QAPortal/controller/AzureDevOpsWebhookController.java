package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.service.AzureDevOpsWebhookEventPublisher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/webhooks/azure-devops")
public class AzureDevOpsWebhookController {

    @Value("${qaportal.webhook.secret:qaportal-webhook-secret-123}")
    private String webhookSecret;

    private final AzureDevOpsWebhookEventPublisher eventPublisher;

    public AzureDevOpsWebhookController(
            AzureDevOpsWebhookEventPublisher eventPublisher
    ) {
        this.eventPublisher = eventPublisher;
    }

    @PostMapping("/events")
    public ResponseEntity<?> receiveAzureDevOpsEvent(
            @RequestParam(value = "secret", required = false) String secret,
            @RequestBody Map<String, Object> payload,
            @RequestHeader Map<String, String> headers
    ) {

        try {
            if (secret == null || !webhookSecret.equals(secret)) {

                return ResponseEntity
                        .status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of(
                                "status", 401,
                                "message", "Invalid webhook secret",
                                "receivedSecret", secret != null ? secret : "null",
                                "time", OffsetDateTime.now().toString()
                        ));
            }

            String eventType = getString(payload, "eventType");
            String publisherId = getString(payload, "publisherId");
            String messageText = getNestedString(payload, "message", "text");
            String detailedMessageText = getNestedString(payload, "detailedMessage", "text");
            String eventCreatedDate = getString(payload, "createdDate");

            Map<String, Object> resource = getMap(payload, "resource");
            Map<String, Object> resourceContainers = getMap(payload, "resourceContainers");

            Map<String, Object> projectContainer = getMap(resourceContainers, "project");
            Map<String, Object> accountContainer = getMap(resourceContainers, "account");
            Map<String, Object> collectionContainer = getMap(resourceContainers, "collection");

            String projectId = getString(projectContainer, "id");
            String projectName = getString(projectContainer, "name");

            String organizationId = getString(accountContainer, "id");
            String organizationName = getString(accountContainer, "name");

            String collectionId = getString(collectionContainer, "id");
            String collectionName = getString(collectionContainer, "name");

            Map<String, Object> fields = getMap(resource, "fields");
            Map<String, Object> revision = getMap(resource, "revision");
            Map<String, Object> revisionFields = getMap(revision, "fields");
            Map<String, Object> revisedBy = getMap(resource, "revisedBy");

            String workItemId = resolveWorkItemId(resource, revision);
            String updateId = getString(resource, "id");
            String revisionNumber = getString(resource, "rev");

            String title = firstNonBlank(
                    getChangedFieldValue(fields, "System.Title"),
                    getFieldValue(revisionFields, "System.Title"),
                    extractTitleFromMessage(messageText)
            );

            String workItemType = firstNonBlank(
                    getChangedFieldValue(fields, "System.WorkItemType"),
                    getFieldValue(revisionFields, "System.WorkItemType")
            );

            String oldState = getOldFieldValue(fields, "System.State");

            String newState = firstNonBlank(
                    getChangedFieldValue(fields, "System.State"),
                    getFieldValue(revisionFields, "System.State")
            );

            String reason = firstNonBlank(
                    getChangedFieldValue(fields, "System.Reason"),
                    getFieldValue(revisionFields, "System.Reason")
            );

            String oldAssignedTo = getOldFieldValue(fields, "System.AssignedTo");

            String newAssignedTo = firstNonBlank(
                    getChangedFieldValue(fields, "System.AssignedTo"),
                    getFieldValue(revisionFields, "System.AssignedTo")
            );

            String oldSeverity = getOldFieldValue(fields, "Microsoft.VSTS.Common.Severity");

            String newSeverity = firstNonBlank(
                    getChangedFieldValue(fields, "Microsoft.VSTS.Common.Severity"),
                    getFieldValue(revisionFields, "Microsoft.VSTS.Common.Severity")
            );

            String changedBy = firstNonBlank(
                    getChangedFieldValue(fields, "System.ChangedBy"),
                    getFieldValue(revisionFields, "System.ChangedBy"),
                    getString(revisedBy, "displayName"),
                    getString(revisedBy, "uniqueName")
            );

            String changedDate = firstNonBlank(
                    getChangedFieldValue(fields, "System.ChangedDate"),
                    getFieldValue(revisionFields, "System.ChangedDate"),
                    eventCreatedDate
            );

            Map<String, Object> changedFields = normalizeChangedFields(fields);

            Map<String, Object> normalizedEvent = new LinkedHashMap<>();

            normalizedEvent.put("receivedAt", OffsetDateTime.now().toString());
            normalizedEvent.put("eventCreatedDate", eventCreatedDate);

            normalizedEvent.put("eventType", eventType);
            normalizedEvent.put("publisherId", publisherId);

            normalizedEvent.put("organizationId", organizationId);
            normalizedEvent.put("organizationName", organizationName);

            normalizedEvent.put("collectionId", collectionId);
            normalizedEvent.put("collectionName", collectionName);

            normalizedEvent.put("projectId", projectId);
            normalizedEvent.put("projectName", projectName);

            normalizedEvent.put("workItemId", workItemId);
            normalizedEvent.put("updateId", updateId);
            normalizedEvent.put("revisionNumber", revisionNumber);

            normalizedEvent.put("workItemType", workItemType);
            normalizedEvent.put("title", title);

            normalizedEvent.put("oldState", oldState);
            normalizedEvent.put("newState", newState);

            normalizedEvent.put("reason", reason);

            normalizedEvent.put("oldAssignedTo", oldAssignedTo);
            normalizedEvent.put("newAssignedTo", newAssignedTo);

            normalizedEvent.put("oldSeverity", oldSeverity);
            normalizedEvent.put("newSeverity", newSeverity);

            normalizedEvent.put("changedBy", changedBy);
            normalizedEvent.put("changedDate", changedDate);

            normalizedEvent.put("message", messageText);
            normalizedEvent.put("detailedMessage", detailedMessageText);

            normalizedEvent.put("changedFields", changedFields);


            eventPublisher.publishAzureDevOpsEvent(normalizedEvent);


            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Azure DevOps event received and published to SSE clients",
                    "eventType", eventType != null ? eventType : "unknown",
                    "projectName", projectName != null ? projectName : "unknown",
                    "workItemId", workItemId != null ? workItemId : "unknown",
                    "newState", newState != null ? newState : "unknown",
                    "changedBy", changedBy != null ? changedBy : "unknown",
                    "activeSubscribers", eventPublisher.getActiveSubscriberCount(),
                    "receivedAt", OffsetDateTime.now().toString()
            ));

        } catch (Exception ex) {
            ex.printStackTrace();

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of(
                            "status", 500,
                            "message", "Failed to process Azure DevOps webhook",
                            "error", ex.getMessage() != null ? ex.getMessage() : "Unknown error",
                            "time", OffsetDateTime.now().toString()
                    ));
        }
    }

    @GetMapping("/events/test")
    public ResponseEntity<?> testWebhookPublish() {

        Map<String, Object> testEvent = new LinkedHashMap<>();
        testEvent.put("receivedAt", OffsetDateTime.now().toString());
        testEvent.put("eventCreatedDate", OffsetDateTime.now().toString());
        testEvent.put("eventType", "manual.test");
        testEvent.put("publisherId", "manual");
        testEvent.put("projectName", "QA Portal");
        testEvent.put("workItemId", "123");
        testEvent.put("updateId", "manual-update");
        testEvent.put("revisionNumber", "1");
        testEvent.put("workItemType", "Bug");
        testEvent.put("title", "Manual Azure DevOps SSE Test");
        testEvent.put("oldState", "Active");
        testEvent.put("newState", "Resolved");
        testEvent.put("changedBy", "Manual Backend Test");
        testEvent.put("message", "Manual test event sent from backend");
        testEvent.put("changedFields", Map.of(
                "System.State", Map.of(
                        "oldValue", "Active",
                        "newValue", "Resolved"
                )
        ));

        eventPublisher.publishAzureDevOpsEvent(testEvent);

        return ResponseEntity.ok(Map.of(
                "status", "success",
                "message", "Manual test event published to React SSE clients",
                "activeSubscribers", eventPublisher.getActiveSubscriberCount(),
                "time", OffsetDateTime.now().toString()
        ));
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
                "status", "running",
                "message", "Azure DevOps webhook endpoint is active",
                "postEndpoint", "/api/webhooks/azure-devops/events",
                "manualTestEndpoint", "/api/webhooks/azure-devops/events/test",
                "activeSubscribers", eventPublisher.getActiveSubscriberCount(),
                "time", OffsetDateTime.now().toString()
        ));
    }

    private String resolveWorkItemId(
            Map<String, Object> resource,
            Map<String, Object> revision
    ) {
        String workItemId = getString(resource, "workItemId");

        if (isValidPositiveNumber(workItemId)) {
            return workItemId;
        }

        String revisionId = getString(revision, "id");

        if (isValidPositiveNumber(revisionId)) {
            return revisionId;
        }

        Map<String, Object> links = getMap(resource, "_links");
        Map<String, Object> parent = getMap(links, "parent");

        String parentHref = getString(parent, "href");
        String idFromParentLink = extractWorkItemIdFromUrl(parentHref);

        if (isValidPositiveNumber(idFromParentLink)) {
            return idFromParentLink;
        }

        String resourceUrl = getString(resource, "url");
        String idFromResourceUrl = extractWorkItemIdFromUrl(resourceUrl);

        if (isValidPositiveNumber(idFromResourceUrl)) {
            return idFromResourceUrl;
        }

        return null;
    }

    private String extractWorkItemIdFromUrl(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }

        Pattern pattern = Pattern.compile("/workItems/(\\d+)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(url);

        if (matcher.find()) {
            return matcher.group(1);
        }

        return null;
    }

    private String extractTitleFromMessage(String messageText) {
        if (messageText == null || messageText.isBlank()) {
            return null;
        }

        Pattern pattern = Pattern.compile("\\((.*?)\\)");
        Matcher matcher = pattern.matcher(messageText);

        if (matcher.find()) {
            return matcher.group(1);
        }

        return null;
    }

    private Map<String, Object> normalizeChangedFields(Map<String, Object> fields) {
        Map<String, Object> result = new LinkedHashMap<>();

        if (fields == null || fields.isEmpty()) {
            return result;
        }

        for (Map.Entry<String, Object> entry : fields.entrySet()) {
            String fieldName = entry.getKey();
            Object value = entry.getValue();

            if (value instanceof Map<?, ?> rawMap) {
                Map<String, Object> fieldChange = new LinkedHashMap<>();

                Object oldValue = rawMap.get("oldValue");
                Object newValue = rawMap.get("newValue");

                fieldChange.put("oldValue", convertValueToString(oldValue));
                fieldChange.put("newValue", convertValueToString(newValue));

                result.put(fieldName, fieldChange);
            } else {
                result.put(fieldName, convertValueToString(value));
            }
        }

        return result;
    }

    private String getChangedFieldValue(Map<String, Object> fields, String fieldName) {
        if (fields == null || fieldName == null) {
            return null;
        }

        Object fieldValue = fields.get(fieldName);

        if (fieldValue == null) {
            return null;
        }

        if (fieldValue instanceof Map<?, ?> rawMap) {
            Object newValue = rawMap.get("newValue");

            if (newValue != null) {
                return convertValueToString(newValue);
            }

            Object value = rawMap.get("value");

            if (value != null) {
                return convertValueToString(value);
            }

            Object oldValue = rawMap.get("oldValue");

            if (oldValue != null) {
                return convertValueToString(oldValue);
            }

            return rawMap.toString();
        }

        return convertValueToString(fieldValue);
    }

    private String getOldFieldValue(Map<String, Object> fields, String fieldName) {
        if (fields == null || fieldName == null) {
            return null;
        }

        Object fieldValue = fields.get(fieldName);

        if (fieldValue instanceof Map<?, ?> rawMap) {
            Object oldValue = rawMap.get("oldValue");

            if (oldValue != null) {
                return convertValueToString(oldValue);
            }
        }

        return null;
    }

    private String getFieldValue(Map<String, Object> fields, String fieldName) {
        if (fields == null || fieldName == null) {
            return null;
        }

        Object fieldValue = fields.get(fieldName);

        if (fieldValue == null) {
            return null;
        }

        return convertValueToString(fieldValue);
    }

    private String convertValueToString(Object value) {
        if (value == null) {
            return null;
        }

        if (value instanceof Map<?, ?> rawMap) {
            Object displayName = rawMap.get("displayName");

            if (displayName != null) {
                return displayName.toString();
            }

            Object uniqueName = rawMap.get("uniqueName");

            if (uniqueName != null) {
                return uniqueName.toString();
            }

            Object name = rawMap.get("name");

            if (name != null) {
                return name.toString();
            }

            Object valueField = rawMap.get("value");

            if (valueField != null) {
                return valueField.toString();
            }

            return rawMap.toString();
        }

        return value.toString();
    }

    private Map<String, Object> getMap(Map<String, Object> map, String key) {
        if (map == null || key == null) {
            return Map.of();
        }

        Object value = map.get(key);

        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> result = new LinkedHashMap<>();

            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                if (entry.getKey() != null) {
                    result.put(entry.getKey().toString(), entry.getValue());
                }
            }

            return result;
        }

        return Map.of();
    }

    private String getString(Map<String, Object> map, String key) {
        if (map == null || key == null) {
            return null;
        }

        Object value = map.get(key);

        if (value == null) {
            return null;
        }

        return value.toString();
    }

    private String getNestedString(
            Map<String, Object> map,
            String parentKey,
            String childKey
    ) {
        Map<String, Object> parent = getMap(map, parentKey);
        return getString(parent, childKey);
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }

        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }

        return null;
    }

    private boolean isValidPositiveNumber(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }

        try {
            return Long.parseLong(value) > 0;
        } catch (NumberFormatException ex) {
            return false;
        }
    }
}