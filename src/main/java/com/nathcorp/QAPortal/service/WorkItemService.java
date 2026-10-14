package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.ado.WorkItemsResponse;
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
import java.util.List;

@Service
public class WorkItemService {

    private final RestTemplate restTemplate;
    private final OboTokenService oboTokenService;

    public WorkItemService(
            RestTemplate restTemplate,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.oboTokenService = oboTokenService;
    }

    public WorkItemsResponse getBugAndIssueList(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
    ) {
        validateInputs(
                authorizationHeader,
                organization,
                project,
                tagName,
                buildName
        );

        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);

        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        String filter = "(WorkItemType eq 'Bug' or WorkItemType eq 'Issue')";
        filter = appendTagFilter(filter, tagName);
        filter = appendTagFilter(filter, buildName);

        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://analytics.dev.azure.com/{organization}/{project}/_odata/v4.0-preview/WorkItems")
                .queryParam(
                        "$filter",
                        filter
                )
                .queryParam(
                        "$select",
                        "WorkItemId,Title,WorkItemType,State"
                )
                .queryParam(
                        "$expand",
                        "Tags($select=TagName)"
                )
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(adoToken);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-TFS-FedAuthRedirect", "Suppress");

        HttpEntity<Void> request = new HttpEntity<>(headers);

        try {
            ResponseEntity<WorkItemsResponse> response =
                    restTemplate.exchange(
                            uri,
                            HttpMethod.GET,
                            request,
                            WorkItemsResponse.class
                    );

            WorkItemsResponse body = response.getBody();

            if (body == null) {
                return new WorkItemsResponse();
            }

            return body;

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps work items call failed");

        } catch (ResourceAccessException e) {
            Throwable root = e.getMostSpecificCause();

            if (root instanceof SocketTimeoutException) {
                throw new ResponseStatusException(
                        HttpStatus.GATEWAY_TIMEOUT,
                        "Azure DevOps work items call timed out",
                        e
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Azure DevOps network error: " + e.getMessage(),
                    e
            );
        }
    }

    private static String appendTagFilter(
            String filter,
            String tagValue
    ) {
        if (tagValue == null || tagValue.isBlank()) {
            return filter;
        }

        String safeTag = tagValue.replace("'", "''");

        return filter + " and Tags/any(t: t/TagName eq '" + safeTag + "')";
    }

    private static void validateInputs(
            String authorizationHeader,
            String organization,
            String project,
            String tagName,
            String buildName
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
}