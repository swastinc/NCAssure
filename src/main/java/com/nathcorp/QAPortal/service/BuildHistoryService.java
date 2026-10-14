package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.BuildDto;
import com.nathcorp.QAPortal.dto.User;
import com.nathcorp.QAPortal.ex.BuildAlreadyExistsException;
import com.nathcorp.QAPortal.repository.BuildHistoryRepository;
import com.nathcorp.QAPortal.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
public class BuildHistoryService {

    @Autowired
    private BuildHistoryRepository repository;

    @Autowired
    private UserRepository userRepo;

    @Autowired
    private OboTokenService oboTokenService;

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private AzureDevOpsWebhookEventPublisher eventPublisher;

    @Value("${ado.org}")
    private String adoOrg;

    /*
     * Normal save method for approval/update flows where an Azure DevOps
     * task must not be created.
     */
    public BuildDto saveBuild(BuildDto build) {
        return repository.save(build);
    }

    /*
     * Release flow. An Azure DevOps task is created only when the build is
     * pending approval.
     */
    public BuildDto saveBuild(
            BuildDto build,
            String authorizationHeader
    ) {

        if (!Boolean.TRUE.equals(build.getIsPendingApproval())) {
            return repository.save(build);
        }

        String adoAccessToken =
                oboTokenService.getAdoAccessToken(authorizationHeader);

        String releasingUserEmail =
                oboTokenService.getUserEmail(authorizationHeader);

        String releasingUserName =
                oboTokenService.getUserName(authorizationHeader);

        build.setReleasedBy(releasingUserName);
        build.setReleaseByEmail(releasingUserEmail);

        BuildDto savedBuild = repository.save(build);



        return savedBuild;
    }

    public BuildDto saveBuildWithTaskCreate(
            BuildDto build,
            String authorizationHeader
    ) {
        return saveBuild(build, authorizationHeader);
    }

    public BuildDto approveBuild(
            BuildDto build,
            String authorizationHeader
    ) {
        String adoAccessToken =
                oboTokenService.getAdoAccessToken(authorizationHeader);

        if (adoAccessToken == null || adoAccessToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Unable to acquire Azure DevOps token using OBO flow"
            );
        }

        createBuildReleaseTask(
                build,
                adoAccessToken
        );

        BuildDto savedBuild = repository.save(build);

        if (Boolean.FALSE.equals(savedBuild.getIsPendingApproval())) {
            eventPublisher.publishRecentReleaseEvent(savedBuild);
        }

        return savedBuild;
    }

    private Integer createBuildReleaseTask(
            BuildDto build,
            String adoAccessToken
    ) {
        try {
            validateAdoTaskRequiredValues(build, adoAccessToken);

            String decodedProjectName =
                    decodeProjectName(build.getProjectName());

            URI uri = buildAdoWorkItemUri(
                    decodedProjectName,
                    "$Task"
            );


            String buildName = safe(build.getBuilds());
            String buildVersion = safe(build.getBuildVersion());

            String title =
                    "Build Released: "
                            + buildName
                            + " - "
                            + buildVersion;

            String description =
                    "<b>Build has been released and is pending QA approval.</b><br/><br/>"
                            + "<b>Project Name:</b> "
                            + safe(decodedProjectName)
                            + "<br/>"
                            + "<b>Build Name:</b> "
                            + buildName
                            + "<br/>"
                            + "<b>Build Version:</b> "
                            + buildVersion
                            + "<br/>"
                            + "<b>Build Type:</b> "
                            + safe(build.getBuildType())
                            + "<br/>"
                            + "<b>Test Priority:</b> "
                            + safe(build.getTestPriority())
                            + "<br/>"
                            + "<b>Testing Status:</b> "
                            + safe(build.getTestingStatus())
                            + "<br/><br/>"
                            + "<b>Released By:</b> "
                            + safe(build.getReleasedBy())
                            + "<br/>"
                            + "<b>Released By Email:</b> "
                            + safe(build.getReleaseByEmail())
                            + "<br/><br/>"
                            + "<b>Build URL:</b> "
                            + safe(build.getBuildUrl())
                            + "<br/>"
                            + "<b>Release Note URL:</b> "
                            + safe(build.getReleaseNoteUrl())
                            + "<br/>"
                            + "<b>Dev Tested Status:</b> "
                            + safe(build.getDevTestedStatus())
                            + "<br/>"
                            + "<b>Dev Test Result URL:</b> "
                            + safe(build.getDevTestedResultUrl())
                            + "<br/><br/>"
                            + "<b>Description:</b><br/>"
                            + safe(build.getDescription())
                            + "<br/><br/>"
                            + "<b>Notes:</b><br/>"
                            + safe(build.getNotes());

            String tags = buildTaskTags(build);

            List<Map<String, Object>> requestBody = new ArrayList<>();

            requestBody.add(Map.of(
                    "op", "add",
                    "path", "/fields/System.Title",
                    "value", title
            ));

            requestBody.add(Map.of(
                    "op", "add",
                    "path", "/fields/System.Description",
                    "value", description
            ));

            requestBody.add(Map.of(
                    "op", "add",
                    "path", "/fields/System.Tags",
                    "value", tags
            ));

            String assignedToIdentity =
                    buildAssignedToIdentity(build);


            /*
             * Assign the task in the initial POST request. This avoids a
             * separate PATCH request after work-item creation.
             */
            if (assignedToIdentity != null) {
                requestBody.add(Map.of(
                        "op", "add",
                        "path", "/fields/System.AssignedTo",
                        "value", assignedToIdentity
                ));
            }

            HttpHeaders headers = new HttpHeaders();

            headers.setContentType(
                    MediaType.valueOf("application/json-patch+json")
            );

            headers.setAccept(
                    List.of(MediaType.APPLICATION_JSON)
            );

            /*
             * Prevent Azure DevOps from redirecting authentication failures
             * to an HTML sign-in page. Without this header RestTemplate may
             * receive text/html and fail while trying to deserialize it as Map.
             */
            headers.set("X-TFS-FedAuthRedirect", "Suppress");

            headers.setBearerAuth(adoAccessToken);

            HttpEntity<List<Map<String, Object>>> requestEntity =
                    new HttpEntity<>(requestBody, headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    uri,
                    HttpMethod.POST,
                    requestEntity,
                    Map.class
            );

            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new RuntimeException(
                        "Azure DevOps returned non-success status: "
                                + response.getStatusCode()
                );
            }

            if (response.getBody() == null
                    || response.getBody().get("id") == null) {

                throw new RuntimeException(
                        "Azure DevOps task created but task ID was not returned."
                );
            }

            Object taskId = response.getBody().get("id");




            return Integer.valueOf(taskId.toString());

        } catch (HttpStatusCodeException ex) {




            throw new RuntimeException(
                    "Azure DevOps task creation failed: "
                            + ex.getStatusCode()
                            + " - "
                            + ex.getResponseBodyAsString(),
                    ex
            );

        } catch (Exception ex) {


            ex.printStackTrace();

            throw new RuntimeException(
                    "Azure DevOps task creation failed: "
                            + ex.getMessage(),
                    ex
            );
        }
    }

    /**
     * Creates a correctly encoded Azure DevOps work-item URI.
     *
     * The project name is decoded first and then encoded exactly once by
     * UriComponentsBuilder. This prevents values such as QA%20Portal from
     * becoming QA%2520Portal.
     */
    private URI buildAdoWorkItemUri(
            String projectName,
            String workItemIdOrType
    ) {

        String decodedProjectName =
                decodeProjectName(projectName);

        return UriComponentsBuilder
                .fromUriString("https://dev.azure.com")
                .pathSegment(
                        adoOrg,
                        decodedProjectName,
                        "_apis",
                        "wit",
                        "workitems",
                        workItemIdOrType
                )
                .queryParam("api-version", "7.1")
                .encode(StandardCharsets.UTF_8)
                .build()
                .toUri();
    }

    private void validateAdoTaskRequiredValues(
            BuildDto build,
            String adoAccessToken
    ) {

        if (adoOrg == null || adoOrg.isBlank()) {
            throw new RuntimeException(
                    "ADO org is missing. Please configure ado.org=NC-QA"
            );
        }

        if (adoAccessToken == null
                || adoAccessToken.isBlank()) {

            throw new RuntimeException(
                    "ADO access token is missing."
            );
        }

        if (build == null) {
            throw new RuntimeException(
                    "Build object is missing."
            );
        }

        if (build.getProjectName() == null
                || build.getProjectName().isBlank()) {

            throw new RuntimeException(
                    "Project name is required to create Azure DevOps task."
            );
        }

        if (build.getBuilds() == null
                || build.getBuilds().isBlank()) {

            throw new RuntimeException(
                    "Build name is required to create Azure DevOps task."
            );
        }

        if (build.getBuildVersion() == null
                || build.getBuildVersion().isBlank()) {

            throw new RuntimeException(
                    "Build version is required to create Azure DevOps task."
            );
        }
    }

    private String decodeProjectName(String projectName) {

        if (projectName == null) {
            return null;
        }

        try {
            String decoded = projectName;

            /*
             * Supports values encoded once or multiple times:
             * QA%2520Portal -> QA%20Portal -> QA Portal
             */
            for (int i = 0; i < 5; i++) {

                String nextDecoded = URLDecoder.decode(
                        decoded,
                        StandardCharsets.UTF_8
                );

                if (nextDecoded.equals(decoded)) {
                    break;
                }

                decoded = nextDecoded;
            }

            return decoded;

        } catch (Exception ex) {
            return projectName;
        }
    }

    private String safe(String value) {
        return value == null || value.isBlank()
                ? "-"
                : value;
    }

    private String buildAssignedToIdentity(BuildDto build) {

        String email =
                trimToNull(build.getReleaseByEmail());

        if (email == null) {
            return null;
        }

        String name =
                trimToNull(build.getReleasedBy());

        if (name == null
                || name.equalsIgnoreCase(email)) {

            return email;
        }

        return name
                .replace("<", "")
                .replace(">", "")
                .trim()
                + " <"
                + email
                + ">";
    }

    private String trimToNull(String value) {

        if (value == null) {
            return null;
        }

        String trimmed = value.trim();

        return trimmed.isEmpty()
                ? null
                : trimmed;
    }

    private String cleanTag(
            String value,
            String fallback
    ) {

        if (value == null || value.isBlank()) {
            return fallback;
        }

        return value.trim()
                .replace(";", "-")
                .replace("\n", " ")
                .replace("\r", " ");
    }

    private String buildTaskTags(BuildDto build) {

        return cleanTag(
                build.getBuildVersion(),
                "Version-NA"
        )
                + "; "
                + cleanTag(
                build.getBuilds(),
                "Build-NA"
        );
    }

    public Iterable<BuildDto> getAllBuilds() {
        return repository.findAll();
    }

    public BuildDto getBuildByProjectId(String id) {

        return repository
                .findByProjectId(id)
                .orElse(null);
    }

    public String getLatestReleasedVersionByProjectNameAndBuildName(
            String projectName,
            String buildName
    ) {

        if (projectName == null
                || projectName.isBlank()) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "projectName is required"
            );
        }

        if (buildName == null
                || buildName.isBlank()) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "buildName is required"
            );
        }

        List<BuildDto> builds =
                repository.findLatestReleasedBuildByProjectNameAndBuildName(
                        projectName.trim(),
                        buildName.trim()
                );

        if (builds == null || builds.isEmpty()) {

            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "No released build found for projectName: "
                            + projectName
                            + " and buildName: "
                            + buildName
            );
        }

        BuildDto latestBuild = builds.get(0);

        if (latestBuild.getBuildVersion() == null
                || latestBuild.getBuildVersion().isBlank()) {

            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Latest released build found, but buildVersion is empty"
            );
        }

        return latestBuild.getBuildVersion();
    }

    public BuildDto updateBuild(
            String projectId,
            BuildDto request
    ) {

        BuildDto existing = repository
                .findByProjectId(projectId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Build not found with projectId: "
                                        + projectId
                        )
                );

        String oldBuildVersion =
                existing.getBuildVersion();

        boolean versionChanged =
                request.getBuildVersion() != null
                        && !request.getBuildVersion()
                        .equals(oldBuildVersion);

        if (versionChanged) {

            String newProjectId =
                    existing.getProjectName()
                            + request.getBuildVersion();

            repository
                    .findByProjectId(newProjectId)
                    .ifPresent(build -> {
                        throw new BuildAlreadyExistsException(
                                "Build already exists."
                        );
                    });

            BuildDto oldDocument = repository
                    .findByProjectId(projectId)
                    .orElseThrow(() ->
                            new RuntimeException(
                                    "Old build not found with projectId: "
                                            + projectId
                            )
                    );

            updateAllowedBuildFields(existing, request);

            repository.delete(oldDocument);

            existing.setProjectId(newProjectId);

            return repository.save(existing);
        }

        updateAllowedBuildFields(existing, request);

        return repository.save(existing);
    }

    private void updateAllowedBuildFields(
            BuildDto existing,
            BuildDto request
    ) {

        if (request.getBuilds() != null) {
            existing.setBuilds(request.getBuilds());
        }

        if (request.getBuildVersion() != null) {
            existing.setBuildVersion(
                    request.getBuildVersion()
            );
        }

        if (request.getBuildType() != null) {
            existing.setBuildType(
                    request.getBuildType()
            );
        }

        if (request.getQaAssignee() != null) {
            existing.setQaAssignee(
                    request.getQaAssignee()
            );
        }

        if (request.getTestingStatus() != null) {
            existing.setTestingStatus(
                    request.getTestingStatus()
            );

            if (!"Completed".equalsIgnoreCase(
                    request.getTestingStatus()
            )) {
                existing.setTestCompletionDate(null);
            }
        }

        if (request.getTestPriority() != null) {
            existing.setTestPriority(
                    request.getTestPriority()
            );
        }

        if (request.getTestCompletionDate() != null) {
            existing.setTestCompletionDate(
                    request.getTestCompletionDate()
            );
        }

        if (request.getBuildAssignDate() != null) {
            existing.setBuildAssignDate(
                    request.getBuildAssignDate()
            );
        }

        if (request.getQaAssigneeEmail() != null) {

            String oldQaAssigneeEmail =
                    existing.getQaAssigneeEmail();

            existing.setQaAssigneeEmail(
                    request.getQaAssigneeEmail()
            );

            if (!Objects.equals(
                    request.getQaAssigneeEmail(),
                    oldQaAssigneeEmail
            )) {
                existing.setBuildAssignDate(
                        OffsetDateTime.now(
                                ZoneId.of("Asia/Kolkata")
                        )
                );
            }
        }

        if (request.getBuildUrl() != null) {
            existing.setBuildUrl(
                    request.getBuildUrl()
            );
        }

        if (request.getReleaseNoteUrl() != null) {
            existing.setReleaseNoteUrl(
                    request.getReleaseNoteUrl()
            );
        }

        if (request.getDescription() != null) {
            existing.setDescription(
                    request.getDescription()
            );
        }

        if (request.getDevTestedStatus() != null) {
            existing.setDevTestedStatus(
                    request.getDevTestedStatus()
            );
        }

        if (request.getDevTestedResultUrl() != null) {
            existing.setDevTestedResultUrl(
                    request.getDevTestedResultUrl()
            );
        }
    }

    public Iterable<BuildDto>
    getBuildsByPendingApprovalandProjectName(
            Boolean isPendingApproval,
            String projectName
    ) {

        return repository
                .findByIsPendingApprovalAndProjectName(
                        isPendingApproval,
                        projectName
                );
    }

    public Iterable<BuildDto> getBuildsByPendingApproval(
            Boolean isPendingApproval,
            String devManagerEmail
    ) {

        return repository.findByIsPendingApproval(
                isPendingApproval,
                devManagerEmail
        );
    }

    public Iterable<BuildDto>
    findByIsPendingApprovalForAdmin(
            Boolean isPendingApproval
    ) {

        return repository
                .findByIsPendingApprovalForAdmin(
                        isPendingApproval
                );
    }

    public Iterable<BuildDto> getBuildsByPendingApproval(
            Boolean isPendingApproval
    ) {

        return repository
                .findByIsPendingApprovalAllBuilds(
                        isPendingApproval
                );
    }

    public List<BuildDto> getLastThreeBuilds() {
        return repository.findLatestThreeApprovedBuilds();
    }

    public BuildDto assignQaEngineer(
            String projectId,
            String qaAssigneeEmail
    ) {

        Optional<BuildDto> optionalBuild =
                repository.findByProjectId(projectId);

        if (optionalBuild.isEmpty()) {
            return null;
        }

        BuildDto build = optionalBuild.get();

        User user = userRepo.findByEmail(qaAssigneeEmail).orElse(null);

        if (user == null) {
            throw new RuntimeException(
                    "QA user not found with email: "
                            + qaAssigneeEmail
            );
        }

        String qaAssigneeName = user.getName();

        OffsetDateTime buildAssignDate =
                OffsetDateTime.now(
                        ZoneId.of("Asia/Kolkata")
                );

        build.setQaAssignee(qaAssigneeName);
        build.setQaAssigneeEmail(qaAssigneeEmail);
        build.setBuildAssignDate(buildAssignDate);
        build.setTestingStatus("In Progress");

        DateTimeFormatter formatter =
                DateTimeFormatter.ofPattern(
                        "dd-MM-yy hh:mm a"
                );

        String testerHistoryEntry =
                buildAssignDate.format(formatter)
                        + " "
                        + qaAssigneeName;

        String existingTesterHistory =
                build.getTesterHistory();

        if (existingTesterHistory == null
                || existingTesterHistory.isBlank()) {

            build.setTesterHistory(testerHistoryEntry);

        } else {

            build.setTesterHistory(
                    existingTesterHistory
                            + "\n"
                            + testerHistoryEntry
            );
        }

        return repository.save(build);
    }
}
