package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.CentralRepo;
import com.nathcorp.QAPortal.repository.CentralRepoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.StreamSupport;

@Service
public class CentralRepoService {

    @Autowired
    private CentralRepoRepository repository;

    public CentralRepo saveRepoEntry(CentralRepo repo) {
        if (repo == null) {
            throw new IllegalArgumentException("Central repository payload is required");
        }

        if (!hasText(repo.getProjectName())) {
            throw new IllegalArgumentException("Project name is required");
        }

        CentralRepo existing = getCentralRepo(repo.getProjectName());

        if (existing == null) {
            return repository.save(repo);
        }

        applyPartialUpdate(existing, repo);

        return repository.save(existing);
    }

    public CentralRepo getCentralRepo(String projectName) {
        if (!hasText(projectName)) {
            return null;
        }

        List<CentralRepo> list = repository.findByProjectName(projectName.trim());

        if (list == null || list.isEmpty()) {
            return null;
        }

        return list.get(0);
    }

    public List<CentralRepo> getAllRepos() {
        Iterable<CentralRepo> it = repository.findAll();

        return StreamSupport.stream(it.spliterator(), false).toList();
    }

    public CentralRepo updateCentralRepoPartial(String projectName, CentralRepo partial) {
        if (!hasText(projectName)) {
            throw new IllegalArgumentException("Project name is required");
        }

        if (partial == null) {
            throw new IllegalArgumentException("Central repository update payload is required");
        }

        CentralRepo existing = getCentralRepo(projectName);

        if (existing == null) {
            existing = new CentralRepo();
            existing.setProjectName(projectName.trim());
        }

        applyPartialUpdate(existing, partial);

        return repository.save(existing);
    }

    private void applyPartialUpdate(CentralRepo target, CentralRepo source) {
        if (hasText(source.getProjectName())) {
            target.setProjectName(source.getProjectName().trim());
        }

        /*
         * Test Cases must work like Reports:
         * - Do not generate a default Test Case link.
         * - Store only the title/link provided by the user from the UI.
         */
        if (source.getTestCasesTitle() != null) {
            target.setTestCasesTitle(trimOrNull(source.getTestCasesTitle()));
        }

        if (source.getTestCasesLink() != null) {
            target.setTestCasesLink(trimOrNull(source.getTestCasesLink()));
        }

        if (source.getDefectsTitle() != null) {
            target.setDefectsTitle(trimOrNull(source.getDefectsTitle()));
        }

        if (source.getDefectsLink() != null) {
            target.setDefectsLink(trimOrNull(source.getDefectsLink()));
        }

        if (source.getReportsTitle() != null) {
            target.setReportsTitle(trimOrNull(source.getReportsTitle()));
        }

        if (source.getReportsLink() != null) {
            target.setReportsLink(trimOrNull(source.getReportsLink()));
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimOrNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();

        return trimmed.isEmpty() ? null : trimmed;
    }
}
