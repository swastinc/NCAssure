package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.CentralRepo;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class CentralRepoDocLinkService implements DocLinkService {

    private final CentralRepoService centralRepoService;

    public CentralRepoDocLinkService(CentralRepoService centralRepoService) {
        this.centralRepoService = centralRepoService;
    }

    @Override
    public List<String> getSharePointLinks(String project, String version) {
        CentralRepo repo = centralRepoService.getCentralRepo(project);
        if (repo == null) return List.of();

        Set<String> links = new LinkedHashSet<>();
        if (StringUtils.hasText(repo.getTestCasesLink())) links.add(repo.getTestCasesLink().trim());
        if (StringUtils.hasText(repo.getDefectsLink())) links.add(repo.getDefectsLink().trim());
        if (StringUtils.hasText(repo.getReportsLink())) links.add(repo.getReportsLink().trim());

        return List.copyOf(links);
    }
}
