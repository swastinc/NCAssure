package com.nathcorp.QAPortal.tool;

import com.nathcorp.QAPortal.Entity.ActivityLog;
import com.nathcorp.QAPortal.dto.*;
import com.nathcorp.QAPortal.service.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;

@Component
public class McpTools {

    private static final String ORG = "NC-QA";

    private final ActivityLogService activityLogService;
    private final FetchBugDetailsService bugService;
    private final FetchIssueDetailsService issueService;
    private final FetchProjectService projectService;
    private final BuildHistoryService buildHistoryService;
    private final CentralRepoService centralRepoService;
    private final OboTokenService oboTokenService;
    private final AuthorizationContextHolder authorizationContextHolder;
    private final HttpServletRequest request;

    public McpTools(
            FetchBugDetailsService bugService,
            FetchIssueDetailsService issueService,
            ActivityLogService activityLogService,
            FetchProjectService projectService,
            BuildHistoryService buildHistoryService,
            CentralRepoService centralRepoService,
            OboTokenService oboTokenService,
            AuthorizationContextHolder authorizationContextHolder,
            HttpServletRequest request
    ) {
        this.bugService = bugService;
        this.issueService = issueService;
        this.activityLogService = activityLogService;
        this.projectService = projectService;
        this.buildHistoryService = buildHistoryService;
        this.centralRepoService = centralRepoService;
        this.oboTokenService = oboTokenService;
        this.authorizationContextHolder = authorizationContextHolder;
        this.request = request;
    }

    private String getAuthorizationHeader() {
        String authorizationHeader = authorizationContextHolder.getAuthorizationHeader();

        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            authorizationHeader = request.getHeader("Authorization");
        }

        try {
            return oboTokenService.requireBackendOrAdoAuthorizationHeader(authorizationHeader);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "MCP tool call is missing a valid backend Authorization header.",
                        ex
                );
            }

            throw ex;
        }
    }

    @Tool(description = """
          Get the central repository entry for a given project from DB.

          Use this tool when the user asks:
          - what is the repo for <project>?
          - show central repo link for <project>
          - open repo for <project>

          Input:
          - projectName: exact project name

          Returns:
          - CentralRepo object if found, otherwise null
          """)
    public CentralRepo get_central_repo(String projectName) {
        if (projectName == null || projectName.isBlank()) {
            return null;
        }

        return centralRepoService.getCentralRepo(projectName.trim());
    }

    @Tool(description = """
          Fetch all Azure DevOps projects for the NC-QA organization.
          Uses the current request's backend API token and OBO flow.

          Use this tool when the user asks:
          - list all projects
          - show available projects
          - what projects exist

          Returns:
          ProjectId, Name, Description, State, Visibility, LastUpdateTime
          """)
    public ProjectsResponse get_all_projects() {
        String authorizationHeader = getAuthorizationHeader();
        return projectService.getAllProjects(authorizationHeader);
    }

    // ---------------- BUG TOOLS ----------------

    @Tool(
            name = "ado_create_bug",
            description = """
                    Create a Bug work item in Azure DevOps.

                    Required fields:
                    - project
                    - title
                    - reproSteps
                    - assignedTo

                    Optional fields:
                    - priority
                    - severity
                    - tags

                    Notes:
                    - tags should include the version tag and buildName tag when the bug belongs to a specific build.
                    - Multiple tags should be passed as comma-separated or semicolon-separated values.
                    """
    )
    public Map<String, Object> adoCreateBug(CreateBugArgs args) {
        String authorizationHeader = getAuthorizationHeader();

        return bugService.createBug(
                authorizationHeader,
                ORG,
                args.project(),
                args.title(),
                args.reproSteps(),
                args.priority(),
                normalizeSeverity(args.severity()),
                args.assignedTo(),
                normalizeTags(args.tags())
        );
    }

    @Tool(description = """
          Fetch Bug work items from Azure DevOps Analytics for the NC-QA organization,
          for a given project, version, and build name.

          Important mapping:
          - version maps to Azure DevOps Analytics Tags/TagName.
          - buildName also maps to Azure DevOps Analytics Tags/TagName.
          - When both version and buildName are provided, both tags must match.

          Parameters:
          - project: Azure DevOps project name.
          - version: version tag filter. Example: 1.0.0, 2026.06.24, v1.
          - buildName: build name tag filter. Example: QA-Build-123, Android-Build, Sprint-24-Build.

          Returns:
          WorkItemId, Title, State, Severity, assignedTo, ChangedDate, ChangedBy(UserName,UserEmail), Tags.
          """)
    public BugDetailsResponse get_bugs(
            String project,
            String version,
            String buildName
    ) {
        String authorizationHeader = getAuthorizationHeader();

        return bugService.getBugDetails(
                authorizationHeader,
                ORG,
                project,
                version,
                buildName
        );
    }

    @Tool(description = """
          Fetch available approved builds that are NOT pending approval.

          These builds represent available QA-ready builds/versions.

          Parameters:
          - projectName: optional filter builds by project name.
          - devManagerEmail: optional dev manager email.

          Use this tool when the user asks:
          - what versions are available
          - list approved builds
          - show builds ready for QA
          - show available build names for a project

          Returns:
          BuildId, ProjectName, BuildName, Version, IsPendingApproval, CreatedDate, QaAssignee.
          """)
    public Iterable<BuildDto> get_available_builds(
            String projectName,
            String devManagerEmail
    ) {
        if (projectName == null || projectName.isBlank()) {
            return buildHistoryService.getBuildsByPendingApproval(false, devManagerEmail);
        }

        return buildHistoryService.getBuildsByPendingApprovalandProjectName(
                false,
                projectName
        );
    }

    @Tool(description = """
          Returns bug severity counts Critical/High/Medium/Low for the NC-QA organization,
          for a given project, version, and build name.

          Important mapping:
          - version maps to Azure DevOps Analytics Tags/TagName.
          - buildName also maps to Azure DevOps Analytics Tags/TagName.
          - When both version and buildName are provided, both tags must match.

          Parameters:
          - project: Azure DevOps project name.
          - version: version tag filter. Required for severity counts.
          - buildName: build name tag filter.

          Output format:
          {"Critical": <n>, "High": <n>, "Medium": <n>, "Low": <n>}
          """)
    public Map<String, Long> get_bug_severity_count(
            String project,
            String version,
            String buildName
    ) {
        String authorizationHeader = getAuthorizationHeader();

        return bugService.getSeverityCounts(
                authorizationHeader,
                ORG,
                project,
                version,
                buildName
        );
    }

    // ---------------- ISSUE TOOLS ----------------

    @Tool(description = """
          Fetch Issue work items from Azure DevOps Analytics for the NC-QA organization,
          for a given project, version, and build name.

          Important mapping:
          - version maps to Azure DevOps Analytics Tags/TagName.
          - buildName also maps to Azure DevOps Analytics Tags/TagName.
          - When both version and buildName are provided, both tags must match.

          Parameters:
          - project: Azure DevOps project name.
          - version: version tag filter. Example: 1.0.0, 2026.06.24, v1.
          - buildName: build name tag filter. Example: QA-Build-123, Android-Build, Sprint-24-Build.

          Returns:
          WorkItemId, Title, State, ChangedDate, ChangedBy(UserName,UserEmail), Tags.
          """)
    public IssueDetailsResponse get_issues(
            String project,
            String version,
            String buildName
    ) {
        String authorizationHeader = getAuthorizationHeader();

        return issueService.getIssueDetails(
                authorizationHeader,
                ORG,
                project,
                version,
                buildName
        );
    }

    // ---------------- ACTIVITY LOG TOOLS ----------------

    @Tool(description = """
          Create an activity log entry in the database.

          Parameters:
          - actionType: short action name, for example CHAT_QUERY, BUGS_FETCH, ISSUES_FETCH, SEVERITY_COUNT.
          - username: who triggered it.
          - details: short description, do NOT include tokens or secrets.

          Returns:
          OK
          """)
    public String create_activity_log(
            String actionType,
            String username,
            String details
    ) {
        activityLogService.log(actionType, username, details);
        return "OK";
    }

    @Tool(description = """
          Fetch all activity logs from the database.

          Returns:
          list of ActivityLog.
          """)
    public List<ActivityLog> get_activity_logs() {
        return activityLogService.getAllLogs();
    }

    @Tool(description = """
          Fetch the most recent activity logs.

          Parameter:
          - limit: number of recent logs to return. Example: 20.

          Returns:
          list of ActivityLog.
          """)
    public List<ActivityLog> get_recent_activity_logs(int limit) {
        List<ActivityLog> all = activityLogService.getAllLogs();
        int n = Math.max(0, Math.min(limit, all.size()));
        return all.subList(0, n);
    }

    @Tool(description = """
    Returns recently released (approved) builds.

    Use this tool when the user asks:
    - any build released last week
    - latest released builds
    - builds released yesterday
    - builds released today
    - recent build releases
    
    Project name is optional. If omitted, builds from all projects are returned.
    """)
    public List<BuildDto> get_recent_builds() {

        Iterable<BuildDto> builds =
                buildHistoryService.getBuildsByPendingApproval(false);

        return StreamSupport.stream(builds.spliterator(), false)
                .toList();
    }

    private static String normalizeSeverity(String s) {
        if (s == null) {
            return null;
        }

        String value = s.trim();
        String lower = value.toLowerCase();

        if (lower.matches("^\\d\\s*-\\s*.*")) {
            return value;
        }

        return switch (lower) {
            case "critical" -> "1 - Critical";
            case "high" -> "2 - High";
            case "medium" -> "3 - Medium";
            case "low" -> "4 - Low";
            default -> value;
        };
    }

    private static String normalizeTags(String tags) {
        if (tags == null) {
            return null;
        }

        return tags.replace(",", ";").trim();
    }
}