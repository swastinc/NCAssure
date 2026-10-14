package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.Entity.ActivityLog;
import com.nathcorp.QAPortal.Entity.SignoffDocument;
import com.nathcorp.QAPortal.dto.SignoffOverviewResponse;
import com.nathcorp.QAPortal.dto.SignoffRequest;
import com.nathcorp.QAPortal.repository.SignoffRepository;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SignoffService {

    private final SignoffRepository repository;

    public SignoffService(SignoffRepository repository) {
        this.repository = repository;
    }

    // ================= CREATE SIGNOFF =================
    public SignoffDocument createSignoff(
            SignoffRequest request) {

//        validateAuth(authHeader);
        SignoffDocument doc = new SignoffDocument();
        doc.setId(UUID.randomUUID().toString());
        doc.setProject(request.getProject());
        doc.setBuildName(request.getBuildName());
        doc.setVersion(request.getVersion());
        doc.setDateChanged(request.getDateChanged());
        doc.setCompletedBy(request.getCompletedBy());
        doc.setApprovedBy(request.getApprovedBy());
        doc.setDescription(request.getDescription());
        doc.setReason(request.getReason());
        doc.setTestEnvironment(request.getTestEnvironment());
        doc.setRisksAssumptions(request.getRisksAssumptions());
        doc.setConclusion(request.getConclusion());
        doc.setPdfPath(request.getSignOffPdfLink());
        // These can later be fetched from analytics APIs
        doc.setAutomatedTestCount(request.getAutomatedTestCount());
        doc.setAutomationCoverage(request.getAutomatedTestPercentage());
        doc.setHoldOrWorkaround(request.getHoldOrWorkaround());

        doc.setCreatedAt(OffsetDateTime.now().toString());

        return repository.save(doc);
    }

    public SignoffDocument updateSignoff(String id, SignoffRequest request) {
        SignoffDocument existing = getById(id);

        // update only necessary editable fields
        existing.setCompletedBy(request.getCompletedBy());
        existing.setApprovedBy(request.getApprovedBy());
        existing.setDescription(request.getDescription());
        existing.setReason(request.getReason());
        existing.setTestEnvironment(request.getTestEnvironment());
        existing.setRisksAssumptions(request.getRisksAssumptions());
        existing.setConclusion(request.getConclusion());
        existing.setPdfPath(request.getSignOffPdfLink());
        existing.setHoldOrWorkaround(request.getHoldOrWorkaround());

        // update approval only if your request contains this field
        if (request.getApproved() != null) {
            existing.setIsApproved(request.getApproved());
        }

        // backend-controlled update date
        existing.setDateChanged(java.time.LocalDate.now());

        return repository.save(existing);
    }

    // ================= OVERVIEW =================
    public List<SignoffOverviewResponse> getOverview(
            String project) {

//        validateAuth(authHeader);

        return repository.findByProject(project)
                .stream()
                .map(doc -> {
                    SignoffOverviewResponse res = new SignoffOverviewResponse();
                    res.setId(doc.getId());
                    res.setVersion(doc.getVersion());
                    res.setBuildName(doc.getBuildName());
                    res.setCompletedBy(doc.getCompletedBy());
                    res.setApprovedBy(doc.getApprovedBy());
                    res.setAutomatedTestCount(doc.getAutomatedTestCount());
                    res.setAutomationCoverage(doc.getAutomationCoverage());
                    res.setPdfPath(doc.getPdfPath());
                    return res;
                })
                .collect(Collectors.toList());
    }

    // ================= AUTH HELPERS (SAME AS BugReportService) =================

    private void validateAuth(String authHeader) {
        AuthorizationUtils.requireBearerAuthorization(authHeader);
    }

    public SignoffDocument updateApproval(String id, boolean approved, String approvedBy) {
        SignoffDocument signoff = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Signoff not found with id: " + id));

        signoff.setIsApproved(approved);
        signoff.setApprovedBy(approvedBy);
        signoff.setDateChanged(LocalDate.now());
        return repository.save(signoff);
    }

    private HttpHeaders buildAuthHeaders(String authHeader) {
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));

        if (authHeader.toLowerCase().startsWith("bearer ")
                || authHeader.toLowerCase().startsWith("basic ")) {
            headers.set(HttpHeaders.AUTHORIZATION, authHeader);
        } else if (authHeader.contains(".")) {
            headers.setBearerAuth(authHeader);
        } else {
            headers.set(HttpHeaders.AUTHORIZATION, toBasicAuthFromPat(authHeader));
        }
        return headers;
    }

    public List<SignoffDocument> getAllSignOffs() {
        List<SignoffDocument> list = new ArrayList<>();
        repository.findAll().forEach(list::add);
        return list;
    }

    public SignoffDocument getById(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sign-off not found"));
    }


    private String toBasicAuthFromPat(String pat) {
        String basicAuth = ":" + pat;
        return "Basic " + Base64.getEncoder().encodeToString(basicAuth.getBytes());
    }
}
