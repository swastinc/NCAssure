package com.nathcorp.QAPortal.dto;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.data.annotation.Id;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Container(containerName = "Builds")
public class BuildDto {

    @Id
    private String projectId;

    private String testerHistory;

    private String builds;
    private String buildVersion;
    private String description;

    private String buildUrl;
    private String releaseNoteUrl;
    private Boolean isPendingApproval;

    @JsonProperty("devTested")
    private String devTestedStatus;

    @JsonProperty("devTestResultUrl")
    private String devTestedResultUrl;

    private String approvedBy;
    private String approverEmail;

    // Build / QA fields
    private String buildType;
    private String qaAssignee;
    private String qaAssigneeEmail;

    @PartitionKey
    private String projectName;

    private String lastSeenBuildApprovalAt; // ISO string

    private OffsetDateTime testCompletionDate;

    private OffsetDateTime buildAssignDate;

    private String releasedBy;
    private String releaseByEmail;
    private String testingStatus;
    private String testPriority;
    private String notes;

    private OffsetDateTime uploadTime;

    // ---------------- Constructors ----------------

    /**
     * Default constructor required by Spring Data Cosmos
     */
    public BuildDto() {
        this.uploadTime = OffsetDateTime.now(ZoneOffset.UTC);
        this.projectId = generateFallbackProjectId();
    }

    /**
     * Full constructor for manual instantiation
     */
    public BuildDto(
            String builds,
            String buildVersion,
            String description,
            String buildUrl,
            String releaseNoteUrl,
            String projectName,
            String releasedBy,
            String releaseByEmail,
            String approvedBy,
            String buildType,
            String qaAssignee,
            String qaAssigneeEmail,
            String testingStatus,
            String devTestedStatus,
            String devTestedResultUrl,
            String testPriority,
            String approverEmail,
            String testerHistory,
            String notes
    ) {

        this.devTestedStatus = devTestedStatus;
        this.devTestedResultUrl = devTestedResultUrl;
        this.builds = builds;
        this.buildVersion = buildVersion;
        this.description = description;
        this.buildUrl = buildUrl;
        this.testerHistory = testerHistory;
        this.releaseNoteUrl = releaseNoteUrl;
        this.projectName = projectName;
        this.releasedBy = releasedBy;
        this.buildType = buildType;
        this.approvedBy = approvedBy;
        this.releaseByEmail = releaseByEmail;
        this.qaAssignee = qaAssignee;
        this.qaAssigneeEmail = qaAssigneeEmail;
        this.uploadTime = OffsetDateTime.now(ZoneOffset.UTC);
        this.projectId =
                generateProjectId(
                        projectName,
                        builds,
                        buildVersion
                );
        this.testingStatus = testingStatus;
        this.testCompletionDate = null;
        this.buildAssignDate = null;
        this.testPriority = testPriority;
        this.approverEmail = approverEmail;
        this.notes = notes;
    }

    // ---------------- Helper Methods ----------------

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    /**
     * Generates projectId from projectName and buildVersion with fallback
     */
    public String generateProjectId(
            String projectName,
            String buildName,
            String buildVersion
    ) {

        String namePart =
                (projectName != null && !projectName.isBlank())
                        ? projectName
                        : "unknownProject";

        String buildNamePart =
                (buildName != null && !buildName.isBlank())
                        ? buildName
                        : "unknownBuildName";

        String versionPart =
                (buildVersion != null && !buildVersion.isBlank())
                        ? buildVersion
                        : UUID.randomUUID().toString();

        return namePart
                + " "
                + buildNamePart
                + " "
                + versionPart;
    }

    public String getApproverEmail() {
        return approverEmail;
    }

    public void setApproverEmail(String approverEmail) {
        this.approverEmail = approverEmail;
    }

    /**
     * Fallback ID when no data is available
     */
    private String generateFallbackProjectId() {
        return "build-" + UUID.randomUUID();
    }

    /**
     * Updates projectId if projectName or buildVersion changes
     */
    private void updateProjectId() {
        this.projectId =
                generateProjectId(
                        this.projectName,
                        this.builds,
                        this.buildVersion
                );
    }

    // ---------------- Getters and Setters ----------------

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }

    public String getBuilds() {
        return builds;
    }

    public void setBuilds(String builds) {
        this.builds = builds;
    }

    public String getBuildVersion() {
        return buildVersion;
    }

    public void setBuildVersion(String buildVersion) {
        this.buildVersion = buildVersion;
        updateProjectId();
    }

    public Boolean getPendingApproval() {
        return isPendingApproval;
    }

    public void setPendingApproval(Boolean pendingApproval) {
        isPendingApproval = pendingApproval;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(String approvedBy) {
        this.approvedBy = approvedBy;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getBuildUrl() {
        return buildUrl;
    }

    public void setBuildUrl(String buildUrl) {
        this.buildUrl = buildUrl;
    }

    public String getReleaseNoteUrl() {
        return releaseNoteUrl;
    }

    public void setReleaseNoteUrl(String releaseNoteUrl) {
        this.releaseNoteUrl = releaseNoteUrl;
    }

    public Boolean getIsPendingApproval() {
        return isPendingApproval;
    }

    public void setIsPendingApproval(Boolean isPendingApproval) {
        this.isPendingApproval = isPendingApproval;
    }

    public String getBuildType() {
        return buildType;
    }

    public void setBuildType(String buildType) {
        this.buildType = buildType;
    }

    public String getQaAssignee() {
        return qaAssignee;
    }

    public void setQaAssignee(String qaAssignee) {
        this.qaAssignee = qaAssignee;
    }

    public String getQaAssigneeEmail() {
        return qaAssigneeEmail;
    }

    public void setQaAssigneeEmail(String qaAssigneeEmail) {
        this.qaAssigneeEmail = qaAssigneeEmail;
    }

    public String getLastSeenBuildApprovalAt() {
        return lastSeenBuildApprovalAt;
    }

    public void setLastSeenBuildApprovalAt(
            String lastSeenBuildApprovalAt
    ) {
        this.lastSeenBuildApprovalAt =
                lastSeenBuildApprovalAt;
    }

    public String getTesterHistory() {
        return testerHistory;
    }

    public void setTesterHistory(String testerHistory) {
        this.testerHistory = testerHistory;
    }

    public String getReleaseByEmail() {
        return releaseByEmail;
    }

    public void setReleaseByEmail(String releaseByEmail) {
        this.releaseByEmail = releaseByEmail;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
        updateProjectId();
    }

    public String getReleasedBy() {
        return releasedBy;
    }

    public void setReleasedBy(String releasedBy) {
        this.releasedBy = releasedBy;
    }

    public OffsetDateTime getUploadTime() {
        return uploadTime;
    }

    public void setUploadTime(
            OffsetDateTime uploadTime
    ) {
        this.uploadTime = uploadTime;
    }

    public String getTestingStatus() {
        return testingStatus;
    }

    public void setTestingStatus(
            String testingStatus
    ) {
        this.testingStatus = testingStatus;
    }

    public String getTestPriority() {
        return testPriority;
    }

    public void setTestPriority(
            String testPriority
    ) {
        this.testPriority = testPriority;
    }

    public OffsetDateTime getTestCompletionDate() {
        return testCompletionDate;
    }

    public void setTestCompletionDate(
            OffsetDateTime testCompletionDate
    ) {
        this.testCompletionDate =
                testCompletionDate;
    }

    public OffsetDateTime getBuildAssignDate() {
        return buildAssignDate;
    }

    public void setBuildAssignDate(
            OffsetDateTime buildAssignDate
    ) {
        this.buildAssignDate =
                buildAssignDate;
    }

    public String getDevTestedStatus() {
        return devTestedStatus;
    }

    public String getDevTestedResultUrl() {
        return devTestedResultUrl;
    }

    public void setDevTestedResultUrl(
            String devTestedResultUrl
    ) {
        this.devTestedResultUrl =
                devTestedResultUrl;
    }

    public void setDevTestedStatus(
            String devTestedStatus
    ) {
        this.devTestedStatus =
                devTestedStatus;
    }
}