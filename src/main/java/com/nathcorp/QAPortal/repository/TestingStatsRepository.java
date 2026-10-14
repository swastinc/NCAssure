package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;

import com.nathcorp.QAPortal.dto.TestingStats;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TestingStatsRepository extends CosmosRepository<TestingStats, String> {

    TestingStats findTestingStatsByProjectNameAndProjectVersion(String projectName, String projectVersion);
}
