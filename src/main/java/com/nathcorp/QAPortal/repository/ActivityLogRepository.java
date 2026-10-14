package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import com.azure.spring.data.cosmos.repository.Query;
import com.nathcorp.QAPortal.Entity.ActivityLog;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ActivityLogRepository extends CosmosRepository<ActivityLog, String> {

    @Query("SELECT * FROM c")
    List<ActivityLog> getAllLogs();

}
