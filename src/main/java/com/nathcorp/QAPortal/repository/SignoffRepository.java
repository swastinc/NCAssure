package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import com.azure.spring.data.cosmos.repository.Query;
import com.nathcorp.QAPortal.Entity.SignoffDocument;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface SignoffRepository extends CosmosRepository<SignoffDocument, String> {

    List<SignoffDocument> findByProject(String project);

    @Query("SELECT VALUE COUNT(1) FROM c WHERE (IS_NULL(c.isApproved) OR c.isApproved = false) AND c.createdAt > @lastSeenAt")
    long countPendingAfter(@Param("lastSeenAt") String lastSeenAt);

    @Query("SELECT VALUE MAX(c.createdAt) FROM c WHERE (IS_NULL(c.isApproved) OR c.isApproved = false)")
    String latestPendingCreatedAt();

    @Query("SELECT COUNT(s) FROM Signoff s " +
            "WHERE s.qaManagerEmail = :email " +
            "AND s.status = 'Pending' " +
            "AND s.updatedAt > :lastSeen")
    long countPendingAfterForQaManager(
            @Param("email") String email,
            @Param("lastSeen") String lastSeen
    );

}
