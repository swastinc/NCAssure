package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.AzureResponse;
import com.nathcorp.QAPortal.dto.WorkItem;
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
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

@Service
public class BugReportService {

    private final RestTemplate restTemplate;
    private final OboTokenService oboTokenService;

    public BugReportService(
            RestTemplate restTemplate,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.oboTokenService = oboTokenService;
    }

    /**
     * Builds a 5-business-day bug summary using Azure DevOps Analytics OData API.
     *
     * Flow:
     * Frontend sends backend API token
     * -> Service uses OboTokenService
     * -> Azure DevOps token is acquired
     * -> Azure DevOps Analytics API is called
     */
    public Map<String, Map<String, Integer>> getLast5BusinessDaysBugReport(
            String authorizationHeader,
            String organization,
            String project
    ) {
        requireBearerAuthorization(authorizationHeader);
        validateInputs(organization, project);

        String adoToken = oboTokenService.getAdoAccessToken(authorizationHeader);

        if (adoToken == null || adoToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        List<LocalDate> businessDays = getLastFiveBusinessDays();
        LocalDate startDate = businessDays.get(businessDays.size() - 1);

        String filter =
                "WorkItemType eq 'Bug' and (" +
                        "CreatedDate ge " + startDate + "T00:00:00Z" +
                        " or " +
                        "ResolvedDate ge " + startDate + "T00:00:00Z" +
                        ")";

        URI uri = UriComponentsBuilder
                .fromHttpUrl("https://analytics.dev.azure.com/{organization}/{project}/_odata/v4.0-preview/WorkItems")
                .queryParam("$filter", filter)
                .queryParam("$select", "WorkItemId,Title,State,CreatedDate,ResolvedDate")
                .buildAndExpand(organization, project)
                .encode()
                .toUri();

        HttpHeaders headers = buildAdoHeaders(adoToken);
        HttpEntity<Void> request = new HttpEntity<>(headers);

        try {
            ResponseEntity<AzureResponse> response =
                    restTemplate.exchange(
                            uri,
                            HttpMethod.GET,
                            request,
                            AzureResponse.class
                    );

            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new ResponseStatusException(
                        response.getStatusCode(),
                        "Failed to fetch analytics data from Azure DevOps"
                );
            }

            AzureResponse body = response.getBody();

            List<WorkItem> items =
                    body != null && body.getValue() != null
                            ? body.getValue()
                            : List.of();

            Map<String, Map<String, Integer>> result = new LinkedHashMap<>();

            businessDays.stream()
                    .sorted()
                    .forEach(day -> {
                        Map<String, Integer> counts = new LinkedHashMap<>();
                        counts.put("createdBugs", 0);
                        counts.put("resolvedBugs", 0);
                        result.put(day.toString(), counts);
                    });

            for (WorkItem item : items) {
                if (item == null) {
                    continue;
                }

                LocalDate createdDate = parseAzureDate(item.getCreatedDate());

                if (createdDate != null && result.containsKey(createdDate.toString())) {
                    result.get(createdDate.toString())
                            .compute("createdBugs", (key, value) -> value == null ? 1 : value + 1);
                }

                LocalDate resolvedDate = parseAzureDate(item.getResolvedDate());

                if (resolvedDate != null && result.containsKey(resolvedDate.toString())) {
                    result.get(resolvedDate.toString())
                            .compute("resolvedBugs", (key, value) -> value == null ? 1 : value + 1);
                }
            }

            return result;

        } catch (HttpStatusCodeException e) {
            throw mapAdoHttpException(e, "Azure DevOps bug report call failed");

        } catch (ResourceAccessException e) {
            Throwable root = e.getMostSpecificCause();

            if (root instanceof SocketTimeoutException) {
                throw new ResponseStatusException(
                        HttpStatus.GATEWAY_TIMEOUT,
                        "Azure DevOps bug report call timed out",
                        e
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Azure DevOps network error: " + e.getMessage(),
                    e
            );

        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to build bug report: " + e.getMessage(),
                    e
            );
        }
    }

    private static void validateInputs(
            String organization,
            String project
    ) {
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

    private static HttpHeaders buildAdoHeaders(String adoToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-TFS-FedAuthRedirect", "Suppress");
        headers.setBearerAuth(adoToken);
        return headers;
    }

    private static LocalDate parseAzureDate(String value) {
        if (value == null || value.isBlank() || value.length() < 10) {
            return null;
        }

        try {
            return LocalDate.parse(value.substring(0, 10));
        } catch (Exception ex) {
            return null;
        }
    }

    private static List<LocalDate> getLastFiveBusinessDays() {
        LocalDate date = LocalDate.now();
        List<LocalDate> days = new ArrayList<>();

        while (days.size() < 5) {
            if (
                    date.getDayOfWeek() != DayOfWeek.SATURDAY &&
                            date.getDayOfWeek() != DayOfWeek.SUNDAY
            ) {
                days.add(date);
            }

            date = date.minusDays(1);
        }

        return days;
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
