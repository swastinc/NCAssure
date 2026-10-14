package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.ProgressResponse;
import com.nathcorp.QAPortal.dto.TestCaseDto;
import com.nathcorp.QAPortal.dto.TestPointDto;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class AzureTestExecutionService {

    private final RestTemplate restTemplate;
    private final OboTokenService oboTokenService;

    public AzureTestExecutionService(
            RestTemplate restTemplate,
            OboTokenService oboTokenService
    ) {
        this.restTemplate = restTemplate;
        this.oboTokenService = oboTokenService;
    }

    public ProgressResponse calculateProgress(
            String authorizationHeader,
            String organization,
            String project,
            String releaseTag,
            String buildName
    ) {
        String validAuthorizationHeader = requireBearerAuthorization(authorizationHeader);

        if (!StringUtils.hasText(organization)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "organization is required"
            );
        }

        if (!StringUtils.hasText(project)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "project is required"
            );
        }

        if (!StringUtils.hasText(releaseTag)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "tag/releaseTag is required"
            );
        }

        if (!StringUtils.hasText(buildName)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "buildName is required"
            );
        }

        String safeOrganization = organization.trim();
        String safeProject = project.trim();
        String safeReleaseTag = releaseTag.trim();
        String safeBuildName = buildName.trim();

        if (!isValidTagValue(safeReleaseTag)) {
            return emptyProgress();
        }

        if (!isValidTagValue(safeBuildName)) {
            return emptyProgress();
        }

        String escapedReleaseTag = escapeODataValue(safeReleaseTag);
        String escapedBuildName = escapeODataValue(safeBuildName);

        String adoToken = oboTokenService.getAdoAccessToken(validAuthorizationHeader);

        if (!StringUtils.hasText(adoToken)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-TFS-FedAuthRedirect", "Suppress");
        headers.setBearerAuth(adoToken);

        HttpEntity<Void> entity = new HttpEntity<>(headers);


        try {
            /*
             * IMPORTANT:
             * This keeps your old working Analytics URL structure.
             * Do not replace this with UriComponentsBuilder for now.
             */

            String releaseAndBuildFilter =
                    "Tags/any(t: t/TagName eq '" + escapedReleaseTag + "')" +
                            " and Tags/any(t: t/TagName eq '" + escapedBuildName + "')";

            String urlWorkItems =
                    "https://analytics.dev.azure.com/" + safeOrganization + "/" + safeProject +
                            "/_odata/v3.0-preview/WorkItems?$count=true" +
                            "&$filter=WorkItemType eq 'Test Case' and (" +
                            "((" + releaseAndBuildFilter + ") and Tags/any(t: t/TagName eq 'Smoke'))" +
                            " or ((" + releaseAndBuildFilter + ") and Tags/any(t: t/TagName eq 'Regression'))" +
                            " or ((" + releaseAndBuildFilter + ") and Tags/any(t: t/TagName eq 'Security'))" +
                            " or ((" + releaseAndBuildFilter + ") and Tags/any(t: t/TagName eq 'Performance'))" +
                            ")" +
                            "&$select=WorkItemId,Title" +
                            "&$expand=Tags($select=TagName)";


            ResponseEntity<Map> workItemResponse =
                    restTemplate.exchange(urlWorkItems, HttpMethod.GET, entity, Map.class);

            Map workItemBody = workItemResponse.getBody();

            if (workItemBody == null || workItemBody.get("value") == null) {
                return emptyProgress();
            }

            List<Map<String, Object>> workItemList =
                    (List<Map<String, Object>>) workItemBody.get("value");

            List<TestCaseDto> filteredTestCases = new ArrayList<>();

            for (Map<String, Object> item : workItemList) {
                Integer id = toInteger(item.get("WorkItemId"));

                String title =
                        item.get("Title") != null
                                ? String.valueOf(item.get("Title"))
                                : "";

                if (id == null) {
                    continue;
                }

                List<Map<String, String>> tagsList =
                        (List<Map<String, String>>) item.get("Tags");

                List<String> tags =
                        tagsList == null
                                ? new ArrayList<>()
                                : tagsList.stream()
                                .map(tag -> tag.get("TagName"))
                                .filter(Objects::nonNull)
                                .collect(Collectors.toList());

                filteredTestCases.add(new TestCaseDto(id, title, tags));
            }

            if (filteredTestCases.isEmpty()) {

                return emptyProgress();
            }

            /*
             * IMPORTANT:
             * This also keeps your old working TestPoints URL.
             */
            String urlTestPoints =
                    "https://analytics.dev.azure.com/" + safeOrganization + "/" + safeProject +
                            "/_odata/v4.0-preview/TestPoints?$select=TestCaseId,LastResultOutcome";


            ResponseEntity<Map> testPointResponse =
                    restTemplate.exchange(urlTestPoints, HttpMethod.GET, entity, Map.class);

            Map testPointBody = testPointResponse.getBody();

            if (testPointBody == null || testPointBody.get("value") == null) {
                return emptyProgress();
            }

            List<Map<String, Object>> testPointList =
                    (List<Map<String, Object>>) testPointBody.get("value");

            List<TestPointDto> testPoints = new ArrayList<>();

            for (Map<String, Object> item : testPointList) {
                Integer testCaseId = toInteger(item.get("TestCaseId"));

                if (testCaseId == null) {
                    continue;
                }

                String lastResultOutcome =
                        item.get("LastResultOutcome") != null
                                ? String.valueOf(item.get("LastResultOutcome"))
                                : null;

                testPoints.add(new TestPointDto(testCaseId, lastResultOutcome));
            }

            Map<String, List<Integer>> tagWiseTestCaseIds = new LinkedHashMap<>();
            tagWiseTestCaseIds.put("Smoke", new ArrayList<>());
            tagWiseTestCaseIds.put("Regression", new ArrayList<>());
            tagWiseTestCaseIds.put("Security", new ArrayList<>());
            tagWiseTestCaseIds.put("Performance", new ArrayList<>());

            for (TestCaseDto testCase : filteredTestCases) {
                if (testCase.getTags() == null) {
                    continue;
                }

                for (String tag : tagWiseTestCaseIds.keySet()) {
                    boolean hasTag =
                            testCase.getTags()
                                    .stream()
                                    .filter(Objects::nonNull)
                                    .anyMatch(existingTag -> existingTag.equalsIgnoreCase(tag));

                    if (hasTag) {
                        tagWiseTestCaseIds.get(tag).add(testCase.getId());
                    }
                }
            }

            ProgressResponse response = new ProgressResponse();

            for (String tag : tagWiseTestCaseIds.keySet()) {
                List<Integer> testCaseIds = tagWiseTestCaseIds.get(tag);
                int total = testCaseIds.size();

                long notExecuted =
                        testPoints.stream()
                                .filter(Objects::nonNull)
                                .filter(testPoint -> testCaseIds.contains(testPoint.getTestCaseId()))
                                .filter(testPoint ->
                                        testPoint.getLastResultOutcome() == null ||
                                                testPoint.getLastResultOutcome().equalsIgnoreCase("None") ||
                                                testPoint.getLastResultOutcome().equalsIgnoreCase("NotExecuted")
                                )
                                .count();

                double progress =
                        total == 0
                                ? 0
                                : ((double) (total - notExecuted) * 100 / total);

                if (tag.equals("Smoke")) {
                    response.setSmokeProgress(progress);
                }

                if (tag.equals("Regression")) {
                    response.setRegressionProgress(progress);
                }

                if (tag.equals("Security")) {
                    response.setSecurityProgress(progress);
                }

                if (tag.equals("Performance")) {
                    response.setPerformanceProgress(progress);
                }
            }

            return response;

        } catch (HttpStatusCodeException e) {
            String adoBody = e.getResponseBodyAsString();


            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Azure DevOps rejected the token. User may need consent or Azure DevOps access.",
                        e
                );
            }

            if (e.getStatusCode() == HttpStatus.FORBIDDEN) {
                if (adoBody != null && adoBody.contains("VS403527")) {
                    throw new ResponseStatusException(
                            HttpStatus.FORBIDDEN,
                            "This feature requires an Azure DevOps Basic level access user. "
                                    + "Your current Azure DevOps access level does not include Analytics access. "
                                    + "Please contact your Azure DevOps administrator to upgrade your access.",
                            e
                    );
                }

                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "User does not have permission to access the requested Azure DevOps resource.",
                        e
                );
            }

            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Azure DevOps Analytics resource was not found. Please verify the organization and project.",
                        e
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Azure DevOps Analytics call failed: " + e.getStatusCode(),
                    e
            );

        } catch (ResponseStatusException e) {
            throw e;

        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to calculate test execution progress: " + e.getMessage(),
                    e
            );
        }
    }

    private static String requireBearerAuthorization(String authorizationHeader) {
        return AuthorizationUtils.requireBearerAuthorization(authorizationHeader);
    }

    private static boolean isValidTagValue(String value) {
        if (!StringUtils.hasText(value)) {
            return false;
        }

        String trimmedValue = value.trim();

        return !trimmedValue.equalsIgnoreCase("__NO_BUILDS__")
                && !trimmedValue.equalsIgnoreCase("No Builds Available")
                && !trimmedValue.equalsIgnoreCase("null")
                && !trimmedValue.equalsIgnoreCase("undefined");
    }

    private static ProgressResponse emptyProgress() {
        ProgressResponse response = new ProgressResponse();
        response.setSmokeProgress(0);
        response.setRegressionProgress(0);
        response.setSecurityProgress(0);
        response.setPerformanceProgress(0);

        return response;
    }

    private static Integer toInteger(Object value) {
        if (value == null) {
            return null;
        }

        if (value instanceof Number number) {
            return number.intValue();
        }

        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String escapeODataValue(String value) {
        return value == null ? "" : value.replace("'", "''");
    }
}