package com.nathcorp.QAPortal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nathcorp.QAPortal.dto.ProjectsResponse;
import com.nathcorp.QAPortal.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class FetchProjectService {

    private static final Logger log =
            LoggerFactory.getLogger(FetchProjectService.class);

    private static final String ADMIN_ROLE = "ADMIN";

    private static final String WEBHOOK_PUBLISHER_ID = "tfs";

    private static final String WEBHOOK_CONSUMER_ID = "webHooks";

    private static final String WEBHOOK_CONSUMER_ACTION_ID =
            "httpRequest";

    private static final String WEBHOOK_RESOURCE_VERSION = "1.0";

    private final RestTemplate http;
    private final ObjectMapper objectMapper;
    private final OboTokenService oboTokenService;
    private final UserRepository userRepository;

    private final String projectsUrl;
    private final String subscriptionsUrl;
    private final String webhookTargetUrl;
    private final String webhookEventType;
    private final boolean autoCreateWebhooks;

    public FetchProjectService(
            RestTemplate http,
            ObjectMapper objectMapper,
            OboTokenService oboTokenService,
            UserRepository userRepository,

            @Value("${azure.base-url}")
            String projectsUrl,

            @Value("${azure.webhooks.subscriptions-url}")
            String subscriptionsUrl,

            @Value("${azure.webhooks.target-url}")
            String webhookTargetUrl,

            @Value("${azure.webhooks.event-type:workitem.created}")
            String webhookEventType,

            @Value("${azure.webhooks.auto-create-enabled:true}")
            boolean autoCreateWebhooks
    ) {
        this.http = http;
        this.objectMapper = objectMapper;
        this.oboTokenService = oboTokenService;
        this.userRepository = userRepository;

        this.projectsUrl = requireConfiguration(
                projectsUrl,
                "azure.base-url"
        );

        this.subscriptionsUrl = requireConfiguration(
                subscriptionsUrl,
                "azure.webhooks.subscriptions-url"
        );

        this.webhookTargetUrl = requireConfiguration(
                webhookTargetUrl,
                "azure.webhooks.target-url"
        );

        this.webhookEventType = requireConfiguration(
                webhookEventType,
                "azure.webhooks.event-type"
        );

        this.autoCreateWebhooks = autoCreateWebhooks;
    }

    /**
     * Retrieves Azure DevOps projects for every authenticated user.
     *
     * Webhook behavior:
     * - ADMIN: Retrieves projects and creates missing webhooks.
     * - Other roles: Retrieves projects only.
     * - Missing user or missing role: Retrieves projects only.
     * - Cosmos DB role-check failure: Retrieves projects only.
     */
    public ProjectsResponse getAllProjects(
            String authorizationHeader
    ) {
        /*
         * Validate the token received by the QA Portal backend.
         */
        String validAuthorizationHeader =
                oboTokenService.requireAuthorizationHeader(
                        authorizationHeader
                );

        /*
         * Resolve the current signed-in user's email.
         */
        String currentUserEmail =
                oboTokenService.getUserEmail(
                        validAuthorizationHeader
                );

        /*
         * Check the user's application role from Cosmos DB.
         *
         * Only ADMIN returns true.
         */
        boolean currentUserIsAdmin =
                isAdminUser(currentUserEmail);

        log.info(
                "Current user resolved for project request: "
                        + "email={}, isAdmin={}",
                currentUserEmail,
                currentUserIsAdmin
        );

        /*
         * Exchange the QA Portal API token for an
         * Azure DevOps access token using OBO.
         */
        String adoToken =
                oboTokenService.getAdoAccessToken(
                        validAuthorizationHeader
                );

        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token "
                            + "using OBO flow"
            );
        }

        HttpHeaders adoHeaders =
                createAdoHeaders(adoToken);

        /*
         * Every authenticated role is allowed to retrieve
         * the Azure DevOps project list.
         */
        ProjectsResponse projectsResponse =
                fetchProjects(adoHeaders);

        /*
         * Stop here when automatic webhook creation
         * is disabled through configuration.
         */
        if (!autoCreateWebhooks) {
            log.debug(
                    "Webhook creation skipped because "
                            + "auto-create is disabled"
            );

            return projectsResponse;
        }

        /*
         * All non-admin users receive the project list only.
         *
         * They are not allowed to:
         * - Read webhook subscriptions.
         * - Check existing webhooks.
         * - Create webhooks.
         */
        if (!currentUserIsAdmin) {
            log.info(
                    "Project list returned without webhook "
                            + "operations because the current "
                            + "user is not ADMIN: email={}",
                    currentUserEmail
            );

            return projectsResponse;
        }

        /*
         * Nothing needs to be done when Azure DevOps
         * returned no projects.
         */
        if (projectsResponse.getValue() == null
                || projectsResponse.getValue().isEmpty()) {

            log.debug(
                    "Webhook creation skipped because "
                            + "no projects were returned"
            );

            return projectsResponse;
        }

        /*
         * This method is reached only when:
         * - The user is authenticated.
         * - The user exists in Cosmos DB.
         * - The user's role is ADMIN.
         * - Auto-create is enabled.
         * - At least one project was returned.
         */
        ensureWebhookForAllProjects(
                projectsResponse,
                adoHeaders
        );

        return projectsResponse;
    }

    /**
     * Fetches the project list from Azure DevOps.
     */
    private ProjectsResponse fetchProjects(
            HttpHeaders headers
    ) {
        try {
            HttpEntity<Void> request =
                    new HttpEntity<>(headers);

            ResponseEntity<ProjectsResponse> response =
                    http.exchange(
                            projectsUrl,
                            HttpMethod.GET,
                            request,
                            ProjectsResponse.class
                    );

            ProjectsResponse projectsResponse =
                    response.getBody();

            if (projectsResponse == null
                    || projectsResponse.getValue() == null) {

                return createEmptyProjectsResponse();
            }

            projectsResponse.setCount(
                    projectsResponse.getValue().size()
            );

            return projectsResponse;

        } catch (HttpStatusCodeException exception) {
            throw mapAzureDevOpsException(
                    exception,
                    "fetch Azure DevOps projects"
            );

        } catch (RestClientException exception) {
            throw mapAzureDevOpsConnectionException(
                    exception,
                    "fetch Azure DevOps projects"
            );
        }
    }

    /**
     * Checks whether the current user has the ADMIN role
     * in the Cosmos DB Users container.
     *
     * This method fails closed:
     * - Missing email returns false.
     * - User not found returns false.
     * - Missing role returns false.
     * - Any database error returns false.
     */
    private boolean isAdminUser(String email) {
        if (email == null || email.isBlank()) {
            log.warn(
                    "Admin role check failed because "
                            + "the token email is blank"
            );

            return false;
        }

        String originalEmail =
                email.trim();

        String normalizedEmail =
                originalEmail.toLowerCase(Locale.ROOT);

        try {
            /*
             * Try the email exactly as received from the token.
             */
            var user = userRepository
                    .findByEmail(originalEmail)
                    .orElse(null);

            /*
             * Cosmos DB comparisons may be case-sensitive.
             *
             * Retry using lowercase when the original email
             * contains uppercase characters.
             */
            if (user == null
                    && !normalizedEmail.equals(originalEmail)) {

                user = userRepository
                        .findByEmail(normalizedEmail)
                        .orElse(null);
            }

            if (user == null) {
                log.warn(
                        "Current user was not found in the "
                                + "Users container: email={}",
                        originalEmail
                );

                return false;
            }

            String role = user.getRole();

            boolean isAdmin =
                    role != null
                            && ADMIN_ROLE.equalsIgnoreCase(
                            role.trim()
                    );

            log.info(
                    "Current user role resolved: "
                            + "email={}, role={}, isAdmin={}",
                    originalEmail,
                    role,
                    isAdmin
            );

            return isAdmin;

        } catch (RuntimeException exception) {
            /*
             * A Cosmos DB failure must never allow webhook
             * creation accidentally.
             */
            log.error(
                    "Unable to verify the current user's role; "
                            + "webhook creation is denied: email={}",
                    originalEmail,
                    exception
            );

            return false;
        }
    }

    /**
     * Ensures every Azure DevOps project has the required webhook.
     *
     * This method must only be called after ADMIN validation.
     */
    private void ensureWebhookForAllProjects(
            ProjectsResponse projectsResponse,
            HttpHeaders headers
    ) {
        JsonNode existingSubscriptions =
                getExistingWebhookSubscriptions(headers);

        for (var project : projectsResponse.getValue()) {
            if (project == null || project.getId() == null) {
                log.warn(
                        "Skipping Azure DevOps project "
                                + "without an ID"
                );

                continue;
            }

            String projectId =
                    project.getId().toString();

            String projectName =
                    project.getName() != null
                            && !project.getName().isBlank()
                            ? project.getName()
                            : projectId;

            boolean webhookAlreadyExists =
                    webhookExistsForProject(
                            existingSubscriptions,
                            projectId
                    );

            if (webhookAlreadyExists) {
                log.info(
                        "Webhook already exists: "
                                + "project={}, projectId={}",
                        projectName,
                        projectId
                );

                continue;
            }

            createWebhookForProject(
                    projectId,
                    projectName,
                    headers
            );
        }
    }

    /**
     * Retrieves existing Azure DevOps webhook subscriptions.
     *
     * This is called only for ADMIN users.
     */
    private JsonNode getExistingWebhookSubscriptions(
            HttpHeaders headers
    ) {
        try {
            HttpEntity<Void> request =
                    new HttpEntity<>(headers);

            ResponseEntity<JsonNode> response =
                    http.exchange(
                            subscriptionsUrl,
                            HttpMethod.GET,
                            request,
                            JsonNode.class
                    );

            JsonNode body =
                    response.getBody();

            return body != null
                    ? body
                    : objectMapper.createObjectNode();

        } catch (HttpStatusCodeException exception) {
            throw mapAzureDevOpsException(
                    exception,
                    "retrieve Azure DevOps webhook subscriptions"
            );

        } catch (RestClientException exception) {
            throw mapAzureDevOpsConnectionException(
                    exception,
                    "retrieve Azure DevOps webhook subscriptions"
            );
        }
    }

    /**
     * Checks whether a matching webhook already exists
     * for the supplied project.
     */
    private boolean webhookExistsForProject(
            JsonNode subscriptionsResponse,
            String projectId
    ) {
        JsonNode subscriptions =
                subscriptionsResponse.path("value");

        if (!subscriptions.isArray()) {
            return false;
        }

        String normalizedTargetUrl =
                normalizeUrl(webhookTargetUrl);

        for (JsonNode subscription : subscriptions) {
            String existingEventType =
                    subscription
                            .path("eventType")
                            .asText();

            String existingConsumerId =
                    subscription
                            .path("consumerId")
                            .asText();

            String existingConsumerActionId =
                    subscription
                            .path("consumerActionId")
                            .asText();

            String existingProjectId =
                    subscription
                            .path("publisherInputs")
                            .path("projectId")
                            .asText();

            String existingTargetUrl =
                    subscription
                            .path("consumerInputs")
                            .path("url")
                            .asText();

            boolean matches =
                    webhookEventType.equals(
                            existingEventType
                    )
                            && WEBHOOK_CONSUMER_ID.equals(
                            existingConsumerId
                    )
                            && WEBHOOK_CONSUMER_ACTION_ID.equals(
                            existingConsumerActionId
                    )
                            && projectId.equalsIgnoreCase(
                            existingProjectId
                    )
                            && normalizedTargetUrl.equals(
                            normalizeUrl(existingTargetUrl)
                    );

            if (matches) {
                return true;
            }
        }

        return false;
    }

    /**
     * Creates an Azure DevOps webhook for one project.
     *
     * This method is reachable only for ADMIN users.
     */
    private void createWebhookForProject(
            String projectId,
            String projectName,
            HttpHeaders headers
    ) {
        Map<String, Object> publisherInputs =
                new LinkedHashMap<>();

        publisherInputs.put(
                "projectId",
                projectId
        );

        Map<String, Object> consumerInputs =
                new LinkedHashMap<>();

        consumerInputs.put(
                "url",
                webhookTargetUrl
        );

        Map<String, Object> requestBody =
                new LinkedHashMap<>();

        requestBody.put(
                "publisherId",
                WEBHOOK_PUBLISHER_ID
        );

        requestBody.put(
                "eventType",
                webhookEventType
        );

        requestBody.put(
                "resourceVersion",
                WEBHOOK_RESOURCE_VERSION
        );

        requestBody.put(
                "consumerId",
                WEBHOOK_CONSUMER_ID
        );

        requestBody.put(
                "consumerActionId",
                WEBHOOK_CONSUMER_ACTION_ID
        );

        requestBody.put(
                "publisherInputs",
                publisherInputs
        );

        requestBody.put(
                "consumerInputs",
                consumerInputs
        );

        try {
            HttpEntity<Map<String, Object>> request =
                    new HttpEntity<>(
                            requestBody,
                            headers
                    );

            ResponseEntity<JsonNode> response =
                    http.exchange(
                            subscriptionsUrl,
                            HttpMethod.POST,
                            request,
                            JsonNode.class
                    );

            JsonNode responseBody =
                    response.getBody();

            String subscriptionId =
                    responseBody != null
                            ? responseBody
                            .path("id")
                            .asText("")
                            : "";

            log.info(
                    "Webhook created successfully: "
                            + "project={}, projectId={}, "
                            + "subscriptionId={}",
                    projectName,
                    projectId,
                    subscriptionId
            );

        } catch (HttpStatusCodeException exception) {
            log.error(
                    "Unable to create webhook: "
                            + "project={}, projectId={}, "
                            + "status={}, body={}",
                    projectName,
                    projectId,
                    exception.getStatusCode(),
                    truncate(
                            exception.getResponseBodyAsString()
                    )
            );

            throw mapAzureDevOpsException(
                    exception,
                    "create webhook for project "
                            + projectName
            );

        } catch (RestClientException exception) {
            throw mapAzureDevOpsConnectionException(
                    exception,
                    "create webhook for project "
                            + projectName
            );
        }
    }

    /**
     * Creates the HTTP headers used for Azure DevOps calls.
     */
    private HttpHeaders createAdoHeaders(
            String adoToken
    ) {
        HttpHeaders headers =
                new HttpHeaders();

        headers.setAccept(
                List.of(MediaType.APPLICATION_JSON)
        );

        headers.setContentType(
                MediaType.APPLICATION_JSON
        );

        headers.set(
                "X-TFS-FedAuthRedirect",
                "Suppress"
        );

        headers.setBearerAuth(adoToken);

        return headers;
    }

    /**
     * Retrieves only projects updated within the supplied
     * number of years.
     *
     * ADMIN users may create missing webhooks because this
     * method internally calls getAllProjects().
     *
     * Other roles receive only the filtered project list.
     */
    public ProjectsResponse getProjectsUpdatedWithinYears(
            int years,
            String authorizationHeader
    ) {
        if (years < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "years must be zero or greater"
            );
        }

        ProjectsResponse response =
                getAllProjects(authorizationHeader);

        OffsetDateTime cutoff =
                OffsetDateTime
                        .now(ZoneOffset.UTC)
                        .minusYears(years);

        var filteredProjects =
                response.getValue()
                        .stream()
                        .filter(project ->
                                project != null
                                        && project
                                        .getLastUpdateTime()
                                        != null
                                        && project
                                        .getLastUpdateTime()
                                        .isAfter(cutoff)
                        )
                        .collect(Collectors.toList());

        ProjectsResponse filteredResponse =
                new ProjectsResponse();

        filteredResponse.setValue(
                filteredProjects
        );

        filteredResponse.setCount(
                filteredProjects.size()
        );

        return filteredResponse;
    }

    /**
     * Creates an empty project response.
     */
    private ProjectsResponse createEmptyProjectsResponse() {
        ProjectsResponse response =
                new ProjectsResponse();

        response.setCount(0);
        response.setValue(List.of());

        return response;
    }

    /**
     * Maps Azure DevOps HTTP errors into backend API responses.
     */
    private ResponseStatusException mapAzureDevOpsException(
            HttpStatusCodeException exception,
            String operation
    ) {
        String contentType =
                exception.getResponseHeaders() != null
                        && exception
                        .getResponseHeaders()
                        .getContentType() != null
                        ? exception
                        .getResponseHeaders()
                        .getContentType()
                        .toString()
                        : "unknown";

        String responseBody =
                exception.getResponseBodyAsString();

        log.error(
                "Azure DevOps request failed: "
                        + "operation={}, status={}, "
                        + "contentType={}, body={}",
                operation,
                exception.getStatusCode(),
                contentType,
                truncate(responseBody)
        );

        if (exception.getStatusCode()
                == HttpStatus.UNAUTHORIZED) {

            return new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Azure DevOps rejected the OBO token "
                            + "while attempting to "
                            + operation
                            + ". The user may need consent "
                            + "or Azure DevOps access.",
                    exception
            );
        }

        if (exception.getStatusCode()
                == HttpStatus.FORBIDDEN) {

            return new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "The signed-in user does not have "
                            + "permission to "
                            + operation
                            + ".",
                    exception
            );
        }

        if (exception.getStatusCode()
                == HttpStatus.BAD_REQUEST) {

            return new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Azure DevOps rejected the webhook "
                            + "configuration while attempting to "
                            + operation
                            + ". Response: "
                            + truncate(responseBody),
                    exception
            );
        }

        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Azure DevOps call failed while attempting to "
                        + operation
                        + ": "
                        + exception.getStatusCode(),
                exception
        );
    }

    /**
     * Maps Azure DevOps connection failures.
     */
    private ResponseStatusException
    mapAzureDevOpsConnectionException(
            RestClientException exception,
            String operation
    ) {
        log.error(
                "Unable to reach Azure DevOps while attempting to {}",
                operation,
                exception
        );

        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Unable to reach Azure DevOps while attempting to "
                        + operation
                        + ".",
                exception
        );
    }

    /**
     * Normalizes webhook URLs for duplicate comparison.
     */
    private String normalizeUrl(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }

        String normalized =
                value.trim();

        while (normalized.endsWith("/")) {
            normalized =
                    normalized.substring(
                            0,
                            normalized.length() - 1
                    );
        }

        return normalized;
    }

    /**
     * Limits logged response bodies to avoid very large logs.
     */
    private String truncate(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }

        int maxLength = 1000;

        if (value.length() <= maxLength) {
            return value;
        }

        return value.substring(
                0,
                maxLength
        ) + "...";
    }

    /**
     * Validates required application configuration.
     */
    private static String requireConfiguration(
            String value,
            String propertyName
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Required configuration is missing: "
                            + propertyName
            );
        }

        return value.trim();
    }
}