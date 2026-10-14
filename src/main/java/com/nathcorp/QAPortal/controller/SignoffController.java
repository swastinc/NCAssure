package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.Entity.SignoffDocument;
import com.nathcorp.QAPortal.dto.SignoffOverviewResponse;
import com.nathcorp.QAPortal.dto.SignoffRequest;
import com.nathcorp.QAPortal.dto.User;
import com.nathcorp.QAPortal.service.ActivityLogService;
import com.nathcorp.QAPortal.service.OboTokenService;
import com.nathcorp.QAPortal.service.SignoffService;
import com.nathcorp.QAPortal.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

@RestController
@RequestMapping("/api/signoff")
public class SignoffController {

    private final SignoffService service;
    private final OboTokenService tokenStore;
    private final UserService userService;

    @Autowired
    private ActivityLogService logService;

    public SignoffController(
            SignoffService service,
            OboTokenService tokenStore,
            UserService userService
    ) {
        this.service = service;
        this.tokenStore = tokenStore;
        this.userService = userService;
    }

    // CREATE SIGNOFF
    @PostMapping("/save")
    public ResponseEntity<SignoffDocument> saveSignOff(

            @RequestBody SignoffRequest request,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        request.setApproved(null);

        String currentUserEmail =
                getCurrentUserEmail(authorizationHeader);

        String currentUserName =
                getCurrentUserName(authorizationHeader);

        logService.log(
                "SIGN OFF REQUESTED",
                currentUserEmail,
                LocalDateTime.now() + " " +
                        "SIGN OFF REQUESTED | Project: " + request.getProject() +
                        " | Version: " + request.getVersion() +
                        " | Version: " + request.getVersion() +
                        " | Reason: " + request.getReason() +
                        " | By: " + currentUserName
        );

        return ResponseEntity.ok(
                service.createSignoff(request)
        );
    }

    @PostMapping("/approveSignOffs")
    public ResponseEntity<SignoffDocument> approveSignOff(

            @RequestParam("id")
            String id,

            @RequestParam("note")
            String note,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        SignoffDocument signoff =
                service.getById(id);

        String email =
                getCurrentUserEmail(authorizationHeader);

        User user =
                userService.getUserByEmail(email);

        signoff.setNotes(note);

        String approvedBy;

        if (user != null
                && user.getName() != null
                && !user.getName().trim().isEmpty()) {

            approvedBy =
                    user.getName().trim() + " (" + email + ")";
        } else {

            approvedBy = email;
        }

        logService.log(
                "SIGN OFF APPROVED",
                email,
                LocalDateTime.now() + " " +
                        "SIGN OFF APPROVED | Project: " + signoff.getProjectName() +
                        " | Version: " + signoff.getVersion() +
                        " | By: " + approvedBy
        );

        return ResponseEntity.ok(
                service.updateApproval(id, true, approvedBy)
        );
    }

    @PostMapping("/rejectSignOffs")
    public ResponseEntity<SignoffDocument> rejectSignOff(

            @RequestParam("id")
            String id,

            @RequestParam("note")
            String note,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        SignoffDocument signoff =
                service.getById(id);

        signoff.setNotes(note);

        String email =
                getCurrentUserEmail(authorizationHeader);

        User user =
                userService.getUserByEmail(email);

        String rejectedBy;

        if (user != null
                && user.getName() != null
                && !user.getName().trim().isEmpty()) {

            rejectedBy =
                    user.getName().trim() + " (" + email + ")";
        } else {

            rejectedBy = email;
        }

        logService.log(
                "SIGN OFF REJECTED",
                email,
                LocalDateTime.now() + " " +
                        "SIGN OFF REJECTED | Project: " + signoff.getProjectName() +
                        " | Version: " + signoff.getVersion() +
                        " | By: " + rejectedBy
        );

        return ResponseEntity.ok(
                service.updateApproval(id, false, rejectedBy)
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<SignoffDocument> getById(

            @PathVariable String id,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(
                service.getById(id)
        );
    }

    @PutMapping("/{id}")
    public ResponseEntity<SignoffDocument> updateSignoff(

            @PathVariable String id,

            @RequestBody SignoffRequest request,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        String currentUserEmail =
                getCurrentUserEmail(authorizationHeader);

        String currentUserName =
                getCurrentUserName(authorizationHeader);

        SignoffDocument existing =
                service.getById(id);

        String updatedFields =
                buildSignoffUpdatedFields(existing, request);

        SignoffDocument updated =
                service.updateSignoff(id, request);

        logService.log(
                "SIGN OFF UPDATED",
                currentUserEmail,
                LocalDateTime.now() + " " +
                        "SIGN OFF UPDATED | Project: " + updated.getProjectName() +
                        " | Version: " + updated.getVersion() +
                        " | Reason: " + updated.getReason() +
                        " | Updated Fields: " + updatedFields +
                        " | By: " + currentUserName
        );

        return ResponseEntity.ok(updated);
    }

    @GetMapping
    public ResponseEntity<List<SignoffDocument>> getAllSignOffs(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        List<SignoffDocument> list =
                service.getAllSignOffs()
                        .stream()
                        // Include Approved & Rejected both signoffs
                        .filter(s -> s.getIsApproved() != null)
                        .sorted(
                                Comparator.comparing(
                                        SignoffDocument::getCreatedAt,
                                        Comparator.nullsLast(
                                                Comparator.reverseOrder()
                                        )
                                )
                        )
                        .toList();

        return ResponseEntity.ok(list);
    }

    @GetMapping("/getPendingSignOffs")
    public ResponseEntity<List<SignoffDocument>> getAllSignOffsWithPendingApproval(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        List<SignoffDocument> pending =
                service.getAllSignOffs()
                        .stream()
                        .filter(s -> s.getIsApproved() == null)
                        .sorted(
                                Comparator.comparing(
                                        SignoffDocument::getDateChanged,
                                        Comparator.nullsLast(
                                                Comparator.reverseOrder()
                                        )
                                )
                        )
                        .toList();

        return ResponseEntity.ok(pending);
    }

    // SIGNOFF OVERVIEW
    @GetMapping("/overview")
    public ResponseEntity<List<SignoffOverviewResponse>> overview(

            @RequestParam String project,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(
                service.getOverview(project)
        );
    }


    private String buildSignoffUpdatedFields(SignoffDocument existing, SignoffRequest request) {
        List<String> changes = new ArrayList<>();

        addChangedField(changes, "Completed By", existing.getCompletedBy(), request.getCompletedBy());
        addChangedField(changes, "Approved By", existing.getApprovedBy(), request.getApprovedBy());
        addChangedField(changes, "Description", existing.getDescription(), request.getDescription());
        addChangedField(changes, "Reason", existing.getReason(), request.getReason());
        addChangedField(changes, "Test Environment", existing.getTestEnvironment(), request.getTestEnvironment());
        addChangedField(changes, "Risks & Assumptions", existing.getRisksAssumptions(), request.getRisksAssumptions());
        addChangedField(changes, "Conclusion", existing.getConclusion(), request.getConclusion());
        addChangedField(changes, "Sign-off PDF Link", existing.getPdfPath(), request.getSignOffPdfLink());
        addChangedField(changes, "Hold/Workaround", existing.getHoldOrWorkaround(), request.getHoldOrWorkaround());

        if (request.getApproved() != null) {
            addChangedField(changes, "Approval Status", existing.getIsApproved(), request.getApproved());
        }

        return changes.isEmpty() ? "No field value changed" : String.join("; ", changes);
    }

    private void addChangedField(List<String> changes, String fieldName, Object oldValue, Object newValue) {
        String oldText = normalizeLogValue(oldValue);
        String newText = normalizeLogValue(newValue);

        if (!Objects.equals(oldText, newText)) {
            changes.add(fieldName + ": " + oldText + " -> " + newText);
        }
    }

    private String normalizeLogValue(Object value) {
        if (value == null) {
            return "-";
        }

        String text = String.valueOf(value).trim();
        return text.isEmpty() ? "-" : text;
    }
    private void validateAuthorization(String authorizationHeader) {
        tokenStore.requireAuthorizationHeader(authorizationHeader);
    }

    private String getCurrentUserEmail(String authorizationHeader) {
        return tokenStore.getUserEmailOrFallback(authorizationHeader);
    }

    private String getCurrentUserName(String authorizationHeader) {
        return tokenStore.getUserNameOrFallback(authorizationHeader);
    }
}
