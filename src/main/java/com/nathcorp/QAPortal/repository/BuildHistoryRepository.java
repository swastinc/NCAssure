package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import com.azure.spring.data.cosmos.repository.Query;
import com.nathcorp.QAPortal.dto.BuildDto;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BuildHistoryRepository extends CosmosRepository<BuildDto, String> {


//    Iterable<BuildDto> findByProjectNameAndIsPendingApproval(String projectName, Boolean isPendingApproval);
//
//    Iterable<BuildDto> findByIsPendingApproval(Boolean isPendingApproval); // <-- add this

    @Query("SELECT VALUE COUNT(1) FROM c WHERE c.isPendingApproval = true AND c.uploadTime > @lastSeenAt")
    long countPendingApprovalsAfter(@Param("lastSeenAt") String lastSeenAt);

    @Query("SELECT VALUE MAX(c.uploadTime) FROM c WHERE c.isPendingApproval = true")
    String latestPendingApprovalTime();



    @Query(value = "SELECT * FROM c " +
            "WHERE c.isPendingApproval = false " +
            "AND c.projectName = @projectName " +
            "AND c.builds = @buildName " +
            "ORDER BY c.uploadTime DESC " +
            "OFFSET 0 LIMIT 1")
    List<BuildDto> findLatestReleasedBuildByProjectNameAndBuildName(
            @Param("projectName") String projectName,
            @Param("buildName") String buildName
    );


    // BuildDto findByProjectId(String projectId);
    Optional<BuildDto> findByProjectId(String projectId);
    Optional<BuildDto> findByProjectName(String projectName);

    @Query("SELECT * FROM c WHERE c.isPendingApproval = @isPendingApproval AND c.projectName = @projectName")
    Iterable<BuildDto> findByIsPendingApprovalAndProjectName(
            @Param("isPendingApproval") Boolean isPendingApproval,
            @Param("projectName") String projectName);

    @Query("SELECT * FROM c WHERE c.isPendingApproval = @isPendingApproval AND c.approverEmail = @approverEmail")
    Iterable<BuildDto> findByIsPendingApproval(
            @Param("isPendingApproval") Boolean isPendingApproval, @Param("approverEmail") String approverEmail);

    @Query("SELECT * FROM c WHERE c.isPendingApproval = @isPendingApproval")
    Iterable<BuildDto> findByIsPendingApprovalForAdmin(
            @Param("isPendingApproval") Boolean isPendingApproval);

    @Query("SELECT * FROM c WHERE c.isPendingApproval = @isPendingApproval OR IS_NULL(c.isPendingApproval)")
    Iterable<BuildDto> findByIsPendingApprovalAllBuilds(
            @Param("isPendingApproval") Boolean isPendingApproval);

    @Query(value = "SELECT * FROM c " +
            "WHERE c.isPendingApproval = false " +
            "AND LOWER(c.testingStatus) = 'not started' " +
            "ORDER BY c.uploadTime DESC " +
            "OFFSET 0 LIMIT 3")
    List<BuildDto> findLatestThreeApprovedBuilds();

    @Query("SELECT VALUE COUNT(1) FROM c WHERE c.devManagerEmail = @email AND c.approvalStatus = 'PENDING' AND c.createdAt > @lastSeen")
    long countPendingApprovalsAfterForDevManager(@Param("email") String email,
                                                 @Param("lastSeen") String lastSeen);


//    @Query("SELECT * FROM c WHERE c.projectId  = @projectId")
//    BuildDto findByProjectId(
//            @Param("projectId ") String projectId));
}
