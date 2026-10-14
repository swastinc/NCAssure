package com.nathcorp.QAPortal.service;


import com.nathcorp.QAPortal.dto.TestingStats;
import com.nathcorp.QAPortal.repository.TestingStatsRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;

@Service
public class TestingStatsService {

    @Autowired
    private TestingStatsRepository repository;

    public TestingStats saveStats(TestingStats stats) {
        return repository.save(stats);
    }

    public Iterable<TestingStats> getAllStats() {
        return repository.findAll();
    }

    public TestingStats updateTestingStats(TestingStats updatedStats) {
        TestingStats existing = repository.findTestingStatsByProjectNameAndProjectVersion(
                updatedStats.getProjectName(), updatedStats.getProjectVersion());

        if (existing == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Testing stats not found for project: " + updatedStats.getProjectName() +
                            " version: " + updatedStats.getProjectVersion());
        }

        existing.setSanityTesting(updatedStats.getSanityTesting());
        existing.setRegressionTesting(updatedStats.getRegressionTesting());
        existing.setSecurityTesting(updatedStats.getSecurityTesting());
        existing.setPerformanceTesting(updatedStats.getPerformanceTesting());

        return repository.save(existing);
    }

    public TestingStats getTestingStatsByProject(String projectName, String projectVersion) {
        TestingStats stats = repository.findTestingStatsByProjectNameAndProjectVersion(projectName, projectVersion);

        if (stats == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Testing stats not found for project: " + projectName +
                            " version: " + projectVersion);
        }
        return stats;
    }

}
