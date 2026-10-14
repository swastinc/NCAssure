package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import com.azure.spring.data.cosmos.repository.Query;
import com.nathcorp.QAPortal.dto.CentralRepo;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CentralRepoRepository extends CosmosRepository<CentralRepo, String> {

    @Query("SELECT * FROM c WHERE c.projectName = @projectName")
    List<CentralRepo> findByProjectName(@Param("projectName") String projectName);
}
