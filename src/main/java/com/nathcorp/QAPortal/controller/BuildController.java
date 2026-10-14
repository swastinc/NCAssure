package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.Entity.ActivityLog;
import com.nathcorp.QAPortal.dto.BuildDto;
import com.nathcorp.QAPortal.dto.User;
import com.nathcorp.QAPortal.ex.BuildAlreadyExistsException;
import com.nathcorp.QAPortal.service.ActivityLogService;
import com.nathcorp.QAPortal.service.BuildHistoryService;
import com.nathcorp.QAPortal.service.OboTokenService;
import com.nathcorp.QAPortal.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@RestController
@RequestMapping("/api/builds")
public class BuildController {

    @Autowired
    private BuildHistoryService service;

    @Autowired
    private ActivityLogService logService;

    @Autowired
    private OboTokenService tokenStore;

    @Autowired
    private UserService userService;

    @GetMapping("/latest-released-version")
    public ResponseEntity<String> getLatestReleasedVersion(
            @RequestParam String projectName,
            @RequestParam String buildName,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        String latestVersion =
                service.getLatestReleasedVersionByProjectNameAndBuildName(
                        projectName,
                        buildName
                );

        return ResponseEntity.ok(latestVersion);
    }

    private void validateToken(String authorizationHeader) {
        tokenStore.requireAuthorizationHeader(authorizationHeader);
    }

    private CurrentUserContext resolveCurrentUser(String authorizationHeader) {
        validateToken(authorizationHeader);

        String currentUserEmail = getCurrentUserEmail(authorizationHeader);
        String currentUserName = getCurrentUserName(authorizationHeader);

        return new CurrentUserContext(currentUserEmail, currentUserName);
    }

    @PostMapping
    public ResponseEntity<BuildDto> saveBuild(
            @RequestBody BuildDto build,
            @RequestParam Map<String, String> userType,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        CurrentUserContext currentUser = resolveCurrentUser(authorizationHeader);

        String type = userType.get("userType");

        if ("DEVENGINEER".equalsIgnoreCase(type)) {

            build.setIsPendingApproval(true);
            build.setQaAssignee("");
            build.setQaAssigneeEmail("");

            if (buildExists(build.getProjectName(), build.getBuilds(), build.getBuildVersion())) {
                throw new BuildAlreadyExistsException("Build is already available.");
            }
            if (buildRequested(build.getProjectName(), build.getBuilds(), build.getBuildVersion())) {
                throw new BuildAlreadyExistsException("Build is already requested for approval.");
            }

            BuildDto saved = service.saveBuild(build, authorizationHeader);

            logService.log(
                    "BUILD RELEASED",
                    currentUser.email(),
                    LocalDateTime.now() + " " +
                            " BUILD RELEASED | Project: " + build.getProjectName() +
                            " | Build: " + build.getBuilds() +
                            " | Version: " + build.getBuildVersion() +
                            " | By: " + currentUser.name()
            );


            return ResponseEntity.ok(saved);

        } else {

            BuildDto saved = service.approveBuild(build, authorizationHeader);


            return ResponseEntity.ok(saved);
        }
    }

    public boolean buildExists(String project, String builds, String buildVersion) {
        if (project == null || project.trim().isEmpty()) {
            return false;
        }
        if (builds == null || builds.trim().isEmpty()) {
            return false;
        }

        if (buildVersion == null || buildVersion.trim().isEmpty()) {
            return false;
        }

        String projectId = project.trim() + builds.trim() + buildVersion.trim();

        return service.getBuildByProjectId(projectId) != null;
    }
    public boolean buildRequested(String project, String builds, String buildVersion) {
        if (project == null || project.trim().isEmpty()) {
            return false;
        }
        if (builds == null || builds.trim().isEmpty()) {
            return false;
        }

        if (buildVersion == null || buildVersion.trim().isEmpty()) {
            return false;
        }

        String projectId = project.trim() + builds.trim() + buildVersion.trim();

        return service.getBuildByProjectId(projectId) != null && service.getBuildByProjectId(projectId).getIsPendingApproval() == true;
    }


    @PostMapping("/{projectId}")
    public ResponseEntity<BuildDto> updateBuild(
            @PathVariable String projectId,
            @RequestBody BuildDto request,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        BuildDto updated = service.updateBuild(projectId, request);
        return ResponseEntity.ok(updated);
    }


    @PatchMapping("/{projectId}/reject")
    public ResponseEntity<?> rejectBuild(
            @PathVariable String projectId,
            @RequestBody Map<String, String> request,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        CurrentUserContext currentUser = resolveCurrentUser(authorizationHeader);

        String approvedBy = request.get("approvedBy");
        String note = request.get("note");

        if (approvedBy == null || approvedBy.isBlank()) {
            approvedBy = currentUser.email();
        }

        BuildDto build = service.getBuildByProjectId(projectId);

        if (build == null) {
            return ResponseEntity
                    .status(HttpStatus.NOT_FOUND)
                    .body("Build not found for projectId: " + projectId);
        }

        build.setIsPendingApproval(null);
        build.setApprovedBy(approvedBy);
        build.setNotes(note);

        BuildDto updated = service.saveBuild(build, authorizationHeader);

        logService.log(
                "BUILD_REJECTED",
                currentUser.email(),
                LocalDateTime.now() +
                        " BUILD REJECTED | Project: " + build.getProjectName() +
                        " | Build: " + build.getBuilds() +
                        " | Version: " + build.getBuildVersion() +
                        " | By: " + currentUser.name() +
                        (note != null ? " | Note: " + note : "")
        );

        return ResponseEntity.ok(updated);
    }

    @PostMapping("final")
    public ResponseEntity<BuildDto> saveBuildFinal(
            @RequestParam("id") String id,
            @RequestParam("notes") String notes,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        CurrentUserContext currentUser = resolveCurrentUser(authorizationHeader);

        BuildDto build = service.getBuildByProjectId(id);

        if (build == null) {
            return ResponseEntity.notFound().build();
        }

        build.setApprovedBy(currentUser.name());
        build.setIsPendingApproval(false);

        logService.log(
                "BUILD APPROVED",
                currentUser.email(),
                LocalDateTime.now() + " " +
                        "BUILD APPROVED | Project: " + build.getProjectName() +
                        " | Build: " + build.getBuilds() +
                        " | Version: " + build.getBuildVersion() +
                        " | By: " + currentUser.name()
        );

        BuildDto saved = service.approveBuild(build, authorizationHeader);

        return ResponseEntity.ok(saved);
    }

    @GetMapping("getBuild")
    public ResponseEntity<BuildDto> getBuild(
            @RequestParam("id") String id,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        BuildDto build = service.getBuildByProjectId(id);

        if (build == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok().body(build);
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<BuildDto>> getBuilds(
            @RequestParam("isPendingApproval") Boolean isPendingApproval,
            @RequestParam("devmanageremail") String devManagerEmail,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        User user = userService.getUserByEmail(devManagerEmail);

        Iterable<BuildDto> it;

        if (Objects.equals(user.getRole(), "ADMIN")) {
            it = service.findByIsPendingApprovalForAdmin(isPendingApproval);
        } else {
            it = service.getBuildsByPendingApproval(isPendingApproval, devManagerEmail);
        }

        List<BuildDto> builds =
                StreamSupport.stream(it.spliterator(), false)
                        .collect(Collectors.toList());

        return ResponseEntity.ok(builds);
    }

    @GetMapping("allFinalBuilds")
    public ResponseEntity<List<BuildDto>> getBuilds(
            @RequestParam("isPendingApproval") Boolean isPendingApproval,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        Iterable<BuildDto> it = service.getBuildsByPendingApproval(isPendingApproval);

        List<BuildDto> builds =
                StreamSupport.stream(it.spliterator(), false)
                        .collect(Collectors.toList());

        return ResponseEntity.ok(builds);
    }

    @GetMapping("all")
    public ResponseEntity<List<BuildDto>> getAllBuilds(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        return ResponseEntity.ok(
                StreamSupport.stream(service.getAllBuilds().spliterator(), false)
                        .collect(Collectors.toList())
        );
    }

    @GetMapping("getAllFinalBuilds")
    public ResponseEntity<List<BuildDto>> getAllBuildsFinal(
            @RequestParam("projectName") String projectName,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        return ResponseEntity.ok(
                StreamSupport.stream(
                                service.getBuildsByPendingApprovalandProjectName(false, projectName)
                                        .spliterator(),
                                false
                        )
                        .collect(Collectors.toList())
        );
    }

    @GetMapping("logs")
    public ResponseEntity<List<ActivityLog>> getLogActivity(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        return ResponseEntity.ok(logService.getAllLogs());
    }

    @GetMapping("/latest")
    public ResponseEntity<List<BuildDto>> getLastThreeBuilds(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        validateToken(authorizationHeader);

        List<BuildDto> builds = service.getLastThreeBuilds();



        return ResponseEntity.ok(builds);
    }

    @PutMapping("/assign-qa")
    public ResponseEntity<?> assignQaEngineer(
            @RequestParam String projectId,
            @RequestParam String qaAssignee,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        CurrentUserContext currentUser = resolveCurrentUser(authorizationHeader);

        BuildDto updatedBuild =
                service.assignQaEngineer(projectId, qaAssignee);

        if (updatedBuild == null) {
            return ResponseEntity
                    .status(HttpStatus.NOT_FOUND)
                    .body("Build not found for projectId: " + projectId);
        }

        logService.log(
                "TESTER ASSIGNED: " + qaAssignee + " ",
                currentUser.email(),
                LocalDateTime.now() +
                        " TESTER ASSIGNED" +
                        " | Project: " + updatedBuild.getProjectName() +
                        " | Build: " + updatedBuild.getBuilds() +
                        " | Version: " + updatedBuild.getBuildVersion() +
                        " | By: " + currentUser.name()
        );

        return ResponseEntity.ok(updatedBuild);
    }

    @PutMapping("/update-test-status")
    public ResponseEntity<?> updateTestStatus(
            @RequestParam String projectId,
            @RequestParam String testingStatus,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader
    ) {
        CurrentUserContext currentUser = resolveCurrentUser(authorizationHeader);

        BuildDto build = service.getBuildByProjectId(projectId);

        if (build == null) {
            return ResponseEntity
                    .status(HttpStatus.NOT_FOUND)
                    .body("Build not found for projectId: " + projectId);
        }

        build.setTestingStatus(testingStatus);

        if ("Completed".equalsIgnoreCase(testingStatus)) {
            build.setTestCompletionDate(OffsetDateTime.now(ZoneOffset.UTC));
            build.setIsPendingApproval(false);
        } else {
            build.setIsPendingApproval(false);
            build.setTestCompletionDate(null);
        }

        BuildDto updated = service.saveBuild(build, authorizationHeader);


        logService.log(
                "TEST STATUS UPDATED",
                currentUser.email(),
                LocalDateTime.now() +
                        " TEST STATUS UPDATED (" + testingStatus + ")" +
                        " | Project: " + build.getProjectName() +
                        " | Build: " + build.getBuilds() +
                        " | Version: " + build.getBuildVersion() +
                        " | By: " + currentUser.name()
        );

        return ResponseEntity.ok(updated);
    }

    private String getCurrentUserEmail(String authorizationHeader) {
        return tokenStore.getUserEmailOrFallback(authorizationHeader);
    }

    private String getCurrentUserName(String authorizationHeader) {
        return tokenStore.getUserNameOrFallback(authorizationHeader);
    }

    private record CurrentUserContext(String email, String name) {
    }
}
