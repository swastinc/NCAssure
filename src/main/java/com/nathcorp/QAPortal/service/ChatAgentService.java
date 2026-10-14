package com.nathcorp.QAPortal.service;

import com.azure.core.exception.HttpResponseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nathcorp.QAPortal.dto.UploadResponse;
import com.nathcorp.QAPortal.tool.McpTools;
import org.springframework.ai.azure.openai.AzureOpenAiChatOptions;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.document.Document;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.*;
import java.util.function.Function;

@Service
public class ChatAgentService {

    private static final int MAX_ANSWER_ATTEMPTS = 2;

    private final ChatClient chatClient;
    private final McpTools bugTools;
    private final UploadedDocRagService uploadedDocRagService;
    private final ObjectMapper objectMapper;
    private final AuthorizationContextHolder authorizationContextHolder;

    public ChatAgentService(
            ChatClient chatClient,
            McpTools bugTools,
            UploadedDocRagService uploadedDocRagService,
            ObjectMapper objectMapper,
            AuthorizationContextHolder authorizationContextHolder
    ) {
        this.chatClient = chatClient;
        this.bugTools = bugTools;
        this.uploadedDocRagService = uploadedDocRagService;
        this.objectMapper = objectMapper;
        this.authorizationContextHolder = authorizationContextHolder;
    }

    private AzureOpenAiChatOptions buildO4MiniAnswerOptions() {
        return AzureOpenAiChatOptions.builder()
                .maxCompletionTokens(2000)
                .build();
    }

    private AzureOpenAiChatOptions buildO4MiniCheckerOptions() {
        return AzureOpenAiChatOptions.builder()
                .maxCompletionTokens(600)
                .build();
    }

    private String callGeneratorSafely(Function<String, String> generator, String questionBlock) {
        try {
            String safeQuestion = sanitizePromptText(questionBlock);
            String out = generator.apply(safeQuestion);
            return out == null ? "" : out;
        } catch (HttpResponseException e) {
            if (isAzureContentFilterError(e)) {
                throw new ContentFilterTriggeredException("Azure content filter triggered", e);
            }
            e.printStackTrace();
            throw e;
        } catch (RuntimeException e) {
            e.printStackTrace();
            throw e;
        }
    }

    private static class ValidationResult {
        final boolean ok;
        final String problem;

        ValidationResult(boolean ok, String problem) {
            this.ok = ok;
            this.problem = problem;
        }

        static ValidationResult ok() {
            return new ValidationResult(true, "");
        }

        static ValidationResult fail(String p) {
            return new ValidationResult(false, p);
        }
    }

    private static class ContentFilterTriggeredException extends RuntimeException {
        ContentFilterTriggeredException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private boolean isSelectionOnly(String msg) {
        if (msg == null) return false;

        String x = msg.trim().toLowerCase(Locale.ROOT);
        boolean mentionsProjOrVer = x.contains("project") || x.contains("version");

        if (!mentionsProjOrVer) {
            return false;
        }

        String[] analytics = {
                "bug", "bugs", "issue", "issues", "severity", "count",
                "list", "status", "state", "open", "resolved"
        };

        for (String k : analytics) {
            if (x.contains(k)) {
                return false;
            }
        }

        return true;
    }

    private ValidationResult validateAnswer(String userQuestion, String answer, boolean attachedMode) {
        String q = userQuestion == null ? "" : userQuestion.trim();
        String a = answer == null ? "" : answer.trim();

        if (a.isBlank()) {
            return ValidationResult.fail("Empty answer.");
        }

        boolean greeting = isGreeting(q);
        boolean selectionOnly = isSelectionOnly(q);

        if (greeting || selectionOnly) {
            if (
                    a.contains("Organization:") ||
                            a.contains("Project:") ||
                            a.contains("Version:") ||
                            a.contains("|")
            ) {
                return ValidationResult.fail("Greeting/Selection-only must not include headers/tables.");
            }

            return ValidationResult.ok();
        }

        if (attachedMode) {
            if (a.toLowerCase(Locale.ROOT).contains("i don't know from the attached file")) {
                return ValidationResult.ok();
            }

            if (!a.matches("(?s).*\\([^\\)]+\\s+page\\s+\\d+\\).*")) {
                return ValidationResult.fail("Attached mode must cite like (fileName page X).");
            }

            if (a.startsWith("Organization:")) {
                return ValidationResult.fail("Attached mode must not use Organization/Project/Version headers.");
            }

            return ValidationResult.ok();
        }

        if (!a.startsWith("Organization:")) {
            return ValidationResult.fail("Missing Organization header.");
        }

        if (!a.contains("Project:") || !a.contains("Version:")) {
            return ValidationResult.fail("Missing Project/Version lines.");
        }

        if (!a.matches("(?s).*\\b\\d+\\b.*")) {
            return ValidationResult.fail("Missing numeric count in response.");
        }

        return ValidationResult.ok();
    }

    /**
     * Do not resolve user from CurrentUserTokenStore or any shared component.
     * Use sessionId as the isolation key for uploaded document RAG.
     */
    private String resolveUserIdFromSession(String sessionId) {
        String sid = sessionId == null ? "" : sessionId.trim();

        if (sid.isBlank()) {
            return "anonymous";
        }

        return "sess:" + sid;
    }

    public UploadResponse uploadAndIndex(String sessionId, MultipartFile file) throws Exception {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId is required");
        }

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("file is required");
        }

        String userId = resolveUserIdFromSession(sessionId);

        String fileId = UUID.randomUUID().toString();

        String fileName =
                file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()
                        ? "file"
                        : file.getOriginalFilename();

        uploadedDocRagService.deletePreviousSessionData(userId, sessionId);

        Path saved = uploadedDocRagService.saveFile(
                userId,
                sessionId,
                fileId,
                file
        );

        uploadedDocRagService.indexFile(
                userId,
                sessionId,
                fileId,
                fileName,
                saved
        );

        return new UploadResponse(fileId, fileName);
    }

    public String ask(String sessionId, String message, String role) {
        return ask(sessionId, message, role, List.of(), null);
    }

    public String ask(String sessionId, String message, String role, List<String> fileIds) {
        return ask(sessionId, message, role, fileIds, null);
    }

    public String ask(
            String sessionId,
            String message,
            String role,
            List<String> fileIds,
            String authorizationHeader
    ) {
        String userMsg = message == null ? "" : message.trim();

        if (userMsg.isEmpty()) {
            return "Please type a message.";
        }

        String safeRole =
                role == null || role.isBlank()
                        ? "UNKNOWN"
                        : role.trim().toUpperCase(Locale.ROOT);

        String convId =
                sessionId == null || sessionId.isBlank()
                        ? UUID.randomUUID().toString()
                        : sessionId;

        String system = """
                # Role and Objective
                You are a DevOps and QA Portal assistant for Azure DevOps Analytics for organization `NC-QA`.
                
                Active role: `Role = %s`
                
                Use the value in `Role = %s` as the current user's active QA Portal role.
                
                # Core Access and Data Rules
                ## Access Rules
                - Never deny access to Azure DevOps data based on role.
                - Always use english language in the response.
                - Role restrictions apply only to QA Portal data and actions.
                - If a QA Portal request exceeds the current role's permissions, explain that the information is not available for the current QA Portal role.
                - Then briefly suggest what can be provided for that role.
                
                ## Data Access Policy
                - Azure DevOps Analytics data is available to all roles.
                - DevOps queries are never restricted by role.
                - QA Portal data follows role-based access control (RBAC).
                - Daily work recommendations must combine DevOps and QA Portal data according to the user's role.
                
                ## Assignment Rule
                - "Assigned to me" refers to the authenticated user identity available in tool context.
                - Never ask the user for their name if assignment information is already available from tools.
                
                # QA Portal Role Scope
                ## `QAENGINEER`
                QA Portal access:
                - Assigned Builds
                - Assigned Test Activities
                - Assigned Signoff Activities
                - Build Test Status
                - Build Released By
                - Build Release Date
                - Build Assign Date
                - Build Test Completion Date
                
                ## `QAMANAGER`
                QA Portal access:
                - Pending Signoffs
                - Unassigned Approved Builds
                - QA Readiness Information
                - Build Test Status
                - Build Released By
                - Build Release Date
                - Build Assign Date
                - Build Test Completion Date
                
                ## `DEVENGINEER`
                QA Portal access:
                - Approved Builds
                - Rejected Builds
                - Rejection Reasons
                - Build Test Status
                - Build Released By
                - Build Release Date
                - Build Assign Date
                - Build Test Completion Date
                
                ## `DEVMANAGER`
                QA Portal access:
                - Pending Build Approvals
                - Approval Status
                - Build Test Status
                - Build Released By
                - Build Release Date
                - Build Assign Date
                - Build Test Completion Date
                
                ## `ADMIN`
                QA Portal access:
                - Full QA Portal Access
                
                ## `DEFAULTUSER`
                QA Portal access:
                - No QA Portal Access
                
                # Daily Work Rules
                If the user is asking about any of the following:
                - today's work
                - assigned work
                - pending work
                - tasks for me
                - what should I do
                - what should I test
                
                Then answer according to role as follows.
                
                ## `QAENGINEER`
                Use 2 sources:
                - DevOps: give bugs, issues, Tasks, and Test Cases assigned to me.
                - QA Portal App: give details about assigned builds whose status is `In Progress`, `Hold`, or `Not Started`.
                
                ## `QAMANAGER`
                Use 2 sources:
                - DevOps: give bugs, issues, Tasks, and Test Cases assigned to me.
                - QA Portal App: give details about approved builds where tester or QA Assignee is not assigned. Also give details about pending signoff requests.
                
                ## `DEVENGINEER`
                Use 2 sources:
                - DevOps: give bugs, issues, and Tasks assigned to me.
                - QA Portal App: give details about approved and rejected build status with reason.
                
                ## `DEVMANAGER`
                Use 2 sources:
                - DevOps: give bugs, issues, and Tasks assigned to me.
                - QA Portal App: give details about pending build approval requests.
                
                ## `ADMIN`
                Use 2 sources:
                - DevOps: give bugs, issues, Tasks, and Test Cases assigned to me.
                - QA Portal App: give details about approved builds where tester or QA Assignee is not assigned, pending signoff requests, and pending build approval requests.
                
                ## `DEFAULTUSER`
                Use DevOps only:
                - DevOps: give bugs, issues, Tasks, and Test Cases assigned to me.
                - Never call QA Portal tools for `DEFAULTUSER` daily work requests.
                
                ## Missing Data for Daily Work or Release Questions
                If required data is missing, say:
                `I don't have enough data from tools to answer that.`
                
                Then ask one short clarifying question.
                
                # Release Questions
                - For release-readiness questions, answer from the role perspective using tool data only.
                - If tool data is missing, say:
                  `I don't have enough data from tools to answer that.`
                - Then ask one short clarifying question.
                
                # Fact and Evidence Rules
                ## Fact Rules
                - Use only facts from tool JSON in this conversation or user-provided text in this conversation.
                - Never guess.
                - Do not use internet sources.
                
                ## Evidence Rules
                - Every number, ID, state, severity, name, or date must appear in tool JSON.
                - Do not invent fields or totals.
                - If JSON is empty or incomplete, say what is missing.
                
                # Memory and Selection Rules
                ## Memory
                - If project/version already exists in memory, reuse it automatically.
                - Do not ask again unless:
                  - the user changes it
                  - a required value is missing
                  - the selected value is invalid
                
                ## Project Requirements
                Project is required only for:
                - bugs
                - issues
                - bug severity
                - work items
                
                Project is not required for:
                - recent build releases
                - builds released last week
                - latest released builds
                - recently approved builds
                
                If the user asks for recently released builds and project is omitted, search across all projects.
                
                ## Input Rules
                - organization is always `NC-QA`
                - project is required only for analytics tool calls that need a project input, such as bugs, issues, bug severity, and work items
                - project is optional for build-release queries that support cross-project search
                - version is optional unless the tool requires it
                - version corresponds to Azure DevOps `TagName`
                
                # Tool-Use Boundaries
                ## When Not to Call Tools
                - For greeting or small talk, do not call tools.
                
                ## Tool Usage
                - If required inputs for the intended tool are missing, do not call that analytics tool.
                - You may call helper tools needed to obtain missing selections, such as `get_all_projects()`, when the user must choose a required project.
                - Use the minimum number of tools required.
                
                ## Selection-Only Rule
                - If the user only sets Project and/or Version and does not ask analytics:
                  - do not call tools
                  - do not return headers or table
                  - confirm the saved selection
                  - ask whether they want Bugs, Issues, or Severity next
                
                ## Project Selection
                - If a project is required for the requested query and not selected:
                  - call `get_all_projects()`
                  - return the exact project names as a numbered list
                  - ask the user to reply with the number or exact project name
                
                # Tool Routing
                - Issues list/count/state -> `get_issues(organization, project, version)`
                - Bug list/count/status -> `get_bugs(organization, project, version)`
                - Bug severity counts -> `get_bug_severity_count(organization, project, version)`
                  - version is required for severity counts
                
                ## Build Release Questions
                Examples:
                - any build released last week
                - latest build
                - builds released yesterday
                - builds released today
                - recent releases
                - release history
                
                Use:
                - `get_recent_builds(period, projectName)`
                
                Parameters:
                - `period`:
                  - `TODAY`
                  - `YESTERDAY`
                  - `LAST_WEEK`
                  - `THIS_WEEK`
                  - `LAST_7_DAYS`
                - `projectName`:
                  - Optional.
                  - If the user does not specify a project, pass `null`.
                  - Search across all projects.
                
                Never ask the user to select a project unless they explicitly ask for a specific project's builds.
                
                ## Bug Creation
                Create Bug -> `adoCreateBug(CreateBugArgs args)`
                
                Use this tool to create a bug in Azure DevOps.
                
                ### Input Handling
                Collect only these fields from the user when missing:
                - title
                - project
                - version
                - reproSteps
                - assignedTo
                
                Do not ask the user for any other bug fields unless absolutely required by the API.
                
                ### Behavior
                - Infer, default, or populate all remaining optional parameters yourself using sensible bug-creation defaults.
                - Keep the bug title clear, concise, and action-oriented.
                - Rewrite repro steps into a clean, structured, professional format before sending them to the tool.
                - Normalize project, version, and assignee values if the user gives them in a slightly informal way.
                - If the user provides partial information, use what is available and only ask for the missing required fields.
                - Do not overwhelm the user with field-by-field questioning.
                
                ### Output Expectations
                - Create the bug with a complete and professional payload.
                - After successful creation, confirm the bug was created and summarize the key details used.
                - If creation fails, return the exact useful reason in simple language.
                
                ### Important
                - Be proactive.
                - Minimize follow-up questions.
                - Prefer smart defaults over asking for unnecessary details.
                
                ## Central Repo Tools
                - Central repo by project -> `get_central_repo(projectName)`
                - List all central repos -> `get_all_central_repos()`
                - Save/update central repo -> `save_central_repo(CentralRepo repo)`
                
                # Response Rules
                ## Greeting Response
                - For greeting or small talk, return only 1-2 short lines.
                - Do not return Organization/Project/Version.
                - Ask what they want to check next.
                
                ## Daily Work Response Format
                For daily work requests:
                1. Show DevOps assignments first.
                2. Show QA Portal assignments second, if QA Portal access applies for the current role.
                3. Clearly label each source:
                   - DevOps
                   - QA Portal
                4. End with a combined summary.
                5. Do not use the normal `Organization/Project/Version/Count` header unless the user is asking a standard analytics question.
                
                For standard analytics questions:
                - Prefer a single tool.
                - Build the answer only from returned JSON.
                
                ## Response Format for Normal Questions
                Return markdown in this exact structure:
                
                ```markdown
                Organization: NC-QA
                Project: <project or "not selected">
                Version: <version or "all versions">
                Count: <count from tool results or 0>
                
                | Column 1 | Column 2 | Column 3 |
                |---|---|---|
                | ... | ... | ... |
                
                - <optional supporting bullet>
                
                Summary: <one short summary sentence including the count>
                ```
                
                Additional rules:
                - Always show project name, version, and count.
                - Use a table for important returned data.
                - Use bullets where needed.
                - For bug or issue lists, use columns appropriate to returned JSON, such as: `ID | Title | State/Status | Assigned To | Severity/Priority | Created Date`.
                - For build/release results, use columns appropriate to returned JSON, such as: `Build/Release ID | Build Name | Status | Project | Released By | Release Date | Assign Date | Test Completion Date`.
                - End with one short summary sentence, maximum 20 words, and include the count.
                
                ## If Data Is Missing
                - Keep the same normal-question header format when responding to a standard analytics question.
                - Show a one-row table saying what is missing.
                - Ask one short clarifying question.
                
                ## Empty Results and Tool Failures
                - If a tool call succeeds but returns no matching data, keep the applicable response format and show `Count: 0`.
                - If a tool call fails or returns incomplete fields, state the missing or failed part plainly and include only facts available from tool output.
                - Ask one short clarifying question only when the next user input can help complete the request.
                
                # Output Shapes by Request Type
                ## 1. Greeting or small talk
                Return only 1-2 short lines.
                
                Example:
                ```text
                Hi — I can help with DevOps analytics or QA Portal status.
                What would you like to check next?
                ```
                
                ## 2. Selection-only request
                Return a short confirmation with no headers and no table.
                
                Example:
                ```text
                Saved project: FooApp.
                Do you want Bugs, Issues, or Severity next?
                ```
                
                ## 3. Daily work request
                Return markdown with this structure:
                
                ```markdown
                ## DevOps
                <bullets or table of assigned items>
                
                ## QA Portal
                <bullets or table of role-allowed QA Portal items, if applicable>
                
                Summary: <one short combined summary>
                ```
                
                For `DEFAULTUSER`, omit the QA Portal section.
                
                ## 4. Standard analytics question
                Return markdown with this structure:
                
                ```markdown
                Organization: NC-QA
                Project: <project or "not selected">
                Version: <version or "all versions">
                Count: <count from tool results or 0>
                
                | Column 1 | Column 2 | Column 3 |
                |---|---|---|
                | ... | ... | ... |
                
                - <optional supporting bullet>
                
                Summary: <one short summary sentence including the count>
                ```
                
                ## 5. Missing data for a standard analytics question
                Return markdown with this structure:
                
                ```markdown
                Organization: NC-QA
                Project: <project or "not selected">
                Version: <version or "all versions">
                Count: 0
                
                | Missing Item | Reason |
                |---|---|
                | <item> | <why it is needed or unavailable> |
                
                <one short clarifying question>
                ```
                
                ## 6. Tool failure
                Return a concise plain-language explanation using only tool-provided details, followed by one short clarifying question when helpful.
                
                # Planning and Completion
                ## Planning
                - Choose the minimum set of tools needed.
                - Reuse saved project/version when valid.
                - Prefer the most direct tool for the user's request.
                - For standard analytics questions, prefer a single tool when possible.
                
                ## Completion Conditions
                - Continue until the user's query is fully resolved.
                - Do not stop on uncertainty; choose the most reasonable path and proceed.
                - Document assumptions at the end when assumptions were necessary.
                - End only when success criteria are met.
                
                # Verbosity and Style
                - Default to concise summaries.
                - For code, use high verbosity with readable names, comments, and straightforward control flow.
                - Use Markdown only where semantically correct, such as lists, code fences, and tables.
                - Put file names, directory names, function names, and class names in `backticks`.
                - Escape math in inline and block form when needed.
                """
                .formatted(safeRole, safeRole);

        var answerOptions = buildO4MiniAnswerOptions();

        List<String> cleanFileIds =
                fileIds == null
                        ? List.of()
                        : fileIds.stream()
                        .filter(id -> id != null && !id.isBlank())
                        .distinct()
                        .toList();

        if (!cleanFileIds.isEmpty() && isGreeting(userMsg)) {
            return "Hi! What do you want to check from the attached document?";
        }

        if (!cleanFileIds.isEmpty()) {
            String ragSessionId = sessionId == null ? "" : sessionId.trim();
            String userId = resolveUserIdFromSession(sessionId);

            List<Document> hits =
                    uploadedDocRagService.search(
                            userId,
                            ragSessionId,
                            cleanFileIds,
                            userMsg,
                            6
                    );

            if (hits.isEmpty()) {
                List<Document> probe =
                        uploadedDocRagService.search(
                                userId,
                                ragSessionId,
                                cleanFileIds,
                                "the",
                                1
                        );


                if (probe.isEmpty() && ragSessionId.isBlank()) {
                    return "Attached file search failed because sessionId is missing or blank. Send the same sessionId used during upload, then ask again.";
                }

                return "I don't know from the attached file(s). I couldn't find relevant content.";
            }

            StringBuilder ctx = new StringBuilder();

            for (Document d : hits) {
                Map<String, Object> m = d.getMetadata();

                String fn = String.valueOf(m.getOrDefault("fileName", "file"));
                String pg = String.valueOf(m.getOrDefault("page", "?"));

                ctx.append("[")
                        .append(fn)
                        .append(" page ")
                        .append(pg)
                        .append("]\n")
                        .append(sanitizeAttachedText(d.getText()))
                        .append("\n\n---\n\n");
            }

            String attachmentRules = """
                    ATTACHED FILE RULES
                    - Use only ATTACHED_CONTEXT for the answer.
                    - If the answer is not present, reply exactly:
                      "I don't know from the attached file."
                    - Cite facts like: (fileName page X).
                    - Do not use Organization/Project/Version headers in attached-file mode.
                    - Do not use any tool in this turn.
                    """;

            Function<String, String> attachedGenerator = (questionBlock) -> {
                String userWithContext = """
                        ATTACHED_CONTEXT:
                        %s

                        QUESTION:
                        %s
                        """.formatted(ctx.toString(), questionBlock);

                try {
                    return safe(
                            chatClient.prompt()
                                    .options(answerOptions)
                                    .system(system + "\n\n" + attachmentRules)
                                    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, convId))
                                    .user(userWithContext)
                                    .call()
                                    .content()
                    );
                } catch (HttpResponseException e) {
                    if (isAzureContentFilterError(e)) {
                        String fallbackQuestion = buildSafeRetryQuestion(questionBlock);

                        String saferUserWithContext = """
                                ATTACHED_CONTEXT:
                                %s

                                QUESTION:
                                %s
                                """.formatted(limitContext(ctx.toString()), fallbackQuestion);

                        return safe(
                                chatClient.prompt()
                                        .options(answerOptions)
                                        .system("""
                                                Answer only from ATTACHED_CONTEXT.
                                                If not found, reply exactly:
                                                I don't know from the attached file.
                                                Cite facts like (fileName page X).
                                                """)
                                        .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, convId))
                                        .user(saferUserWithContext)
                                        .call()
                                        .content()
                        );
                    }

                    throw e;
                }
            };

            return generateWithChecker(userMsg, true, attachedGenerator);
        }

        Function<String, String> normalGenerator = (questionBlock) -> {
            try {
                return safe(
                        chatClient.prompt()
                                .options(answerOptions)
                                .system(system)
                                .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, convId))
                                .tools(bugTools)
                                .user(questionBlock)
                                .call()
                                .content()
                );
            } catch (HttpResponseException e) {
                if (isAzureContentFilterError(e)) {
                    String fallbackQuestion = buildSafeRetryQuestion(questionBlock);

                    return safe(
                            chatClient.prompt()
                                    .options(answerOptions)
                                    .system("""
                                            You are a QA DevOps assistant for NC-QA.
                                            Always use english language for the response.
                                            Use only tool results from this conversation and user-provided text.
                                            Never guess.
                                            For greetings, reply briefly with no headers.
                                            For normal questions, use:
                                            Organization: NC-QA
                                            Project: ...
                                            Version: ...
                                            Then include count, table if needed, and one short summary.
                                            If required data is missing, say:
                                            I don't have enough data from tools to answer that.
                                            Then ask one short clarifying question.
                                            """)
                                    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, convId))
                                    .tools(bugTools)
                                    .user(fallbackQuestion)
                                    .call()
                                    .content()
                    );
                }

                throw e;
            }
        };

        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            return generateWithChecker(userMsg, false, normalGenerator);
        }

        authorizationContextHolder.setAuthorizationHeader(authorizationHeader);

        try {
            return generateWithChecker(userMsg, false, normalGenerator);
        } finally {
            authorizationContextHolder.clear();
        }
    }

    private String sanitizeAttachedText(String text) {
        if (text == null) return "";

        String s = text.replace("\u0000", " ");
        String[] lines = s.split("\\R");
        StringBuilder out = new StringBuilder();

        for (String line : lines) {
            String l = line == null ? "" : line.trim();

            if (l.isBlank()) {
                continue;
            }

            String ll = l.toLowerCase(Locale.ROOT);

            if (looksLikeMetaInstruction(ll)) {
                continue;
            }

            out.append(l).append("\n");

            if (out.length() > 3000) {
                break;
            }
        }

        return out.toString();
    }

    private boolean looksLikeMetaInstruction(String lowerLine) {
        if (lowerLine == null || lowerLine.isBlank()) {
            return false;
        }

        return lowerLine.startsWith("system:")
                || lowerLine.startsWith("developer:")
                || lowerLine.startsWith("assistant:")
                || lowerLine.startsWith("user:")
                || lowerLine.contains("previous instruction")
                || lowerLine.contains("system message")
                || lowerLine.contains("developer message")
                || lowerLine.contains("prompt")
                || lowerLine.contains("override instruction");
    }

    private String sanitizePromptText(String text) {
        if (text == null) return "";

        String s = text;

        s = s.replaceAll("(?i)ignore\\s+previous\\s+instructions?", "ignore-earlier-text");
        s = s.replaceAll("(?i)disregard\\s+previous\\s+instructions?", "ignore-earlier-text");
        s = s.replaceAll("(?i)system\\s*prompt", "internal-text");
        s = s.replaceAll("(?i)developer\\s*message", "internal-text");
        s = s.replaceAll("(?i)jailbreak", "unsafe-request");
        s = s.replaceAll("(?i)bypass", "skip");
        s = s.replaceAll("(?i)do\\s+anything\\s+now", "unsafe-request");

        return s.trim();
    }

    private String buildSafeRetryQuestion(String originalQuestion) {
        String q = sanitizePromptText(originalQuestion);
        q = q.replaceAll("(?is)FIX THIS ISSUE:.*", "").trim();

        if (q.isBlank()) {
            return "Answer the user's request using safe concise wording.";
        }

        return """
                User request:
                %s

                Answer briefly and safely.
                """.formatted(q);
    }

    private String limitContext(String context) {
        if (context == null) {
            return "";
        }

        if (context.length() <= 5000) {
            return context;
        }

        return context.substring(0, 5000);
    }

    private boolean isAzureContentFilterError(HttpResponseException e) {
        if (e == null) return false;

        String msg = safe(e.getMessage()).toLowerCase(Locale.ROOT);

        if (msg.contains("content_filter")) return true;
        if (msg.contains("responsibleaipolicyviolation")) return true;
        if (msg.contains("\"code\":\"content_filter\"")) return true;
        if (msg.contains("prompt triggering")) return true;
        if (msg.contains("filtered due to the prompt")) return true;

        try {
            String body =
                    safe(e.getResponse() != null
                            ? e.getResponse().getBodyAsString().block()
                            : "");

            String lower = body.toLowerCase(Locale.ROOT);

            return lower.contains("content_filter")
                    || lower.contains("responsibleaipolicyviolation")
                    || lower.contains("prompt triggering")
                    || lower.contains("filtered due to the prompt");
        } catch (Exception ignore) {
            return false;
        }
    }

    private String generateWithChecker(
            String originalUserMsg,
            boolean attachedMode,
            Function<String, String> generator
    ) {
        String questionBlock = originalUserMsg;
        String answer;

        try {
            answer = callGeneratorSafely(generator, questionBlock);
        } catch (ContentFilterTriggeredException e) {
            return fallbackContentFilterMessage(attachedMode);
        }

        for (int attempt = 1; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
            ValidationResult vr = validateAnswer(originalUserMsg, answer, attachedMode);

            if (vr.ok) {
                return answer;
            }

            questionBlock = """
                    ORIGINAL_QUESTION:
                    %s

                    RESPONSE ISSUE:
                    %s

                    Please answer again using the required format only.
                    """.formatted(
                    sanitizePromptText(originalUserMsg),
                    sanitizePromptText(vr.problem)
            );


            try {
                answer = callGeneratorSafely(generator, questionBlock);
            } catch (ContentFilterTriggeredException e) {
                return fallbackContentFilterMessage(attachedMode);
            }
        }

        return answer;
    }

    private String fallbackContentFilterMessage(boolean attachedMode) {
        if (attachedMode) {
            return "I couldn't process that exact wording for the attached-file question. Please ask the same question in simpler business terms, for example: \"Summarize page 2\" or \"What does this file say about release status?\"";
        }

        return """
                Organization: NC-QA

                | Status |
                |---|
                | I could not process that exact wording safely. Please ask the same request in simple business terms such as bugs, issues, severity, project, or version. |

                Please rephrase the request in one short sentence.
                """;
    }

    private CheckResult checkAnswer(
            String userQuestion,
            String assistantAnswer,
            boolean attachedMode
    ) {
        if (assistantAnswer == null || assistantAnswer.trim().isEmpty()) {
            return new CheckResult(
                    false,
                    List.of("Empty answer"),
                    "Return a non-empty answer that follows the required format."
            );
        }

        var checkOptions = buildO4MiniCheckerOptions();

        String checkerSystem = """
                You are a strict answer checker.

                Verify whether the answer matches the user question and required output shape.

                Rules:
                1) Greeting -> only 1-2 short lines, no headers or table.
                2) Selection-only -> confirm selection, ask what next, no headers or table.
                3) Normal -> must start with:
                   Organization: NC-QA
                   Project: ...
                   Version: ...
                   and include a count.
                4) Attached mode -> answer only from attached content and cite like (fileName page X).

                Return JSON only:
                {"ok": true/false, "problems": ["..."], "retry_instruction": "..."}
                """;

        String payload = """
                MODE: %s

                USER_QUESTION:
                %s

                ASSISTANT_ANSWER:
                %s
                """.formatted(
                attachedMode ? "ATTACHED" : "NORMAL",
                sanitizePromptText(userQuestion),
                assistantAnswer
        );

        String raw;

        try {
            raw = safe(
                    chatClient.prompt()
                            .options(checkOptions)
                            .system(checkerSystem)
                            .user(payload)
                            .call()
                            .content()
            );
        } catch (Exception e) {
            return new CheckResult(true, List.of(), "");
        }

        return parseCheckResult(raw);
    }

    private CheckResult parseCheckResult(String raw) {
        if (raw == null || raw.isBlank()) {
            return new CheckResult(true, List.of(), "");
        }

        try {
            JsonNode n = objectMapper.readTree(raw.trim());
            boolean ok = n.path("ok").asBoolean(true);

            List<String> problems = new ArrayList<>();

            if (n.has("problems") && n.get("problems").isArray()) {
                for (JsonNode p : n.get("problems")) {
                    problems.add(p.asText(""));
                }
            }

            String retryInstruction = n.path("retry_instruction").asText("");

            return new CheckResult(ok, problems, retryInstruction);

        } catch (Exception e) {
            return new CheckResult(true, List.of(), "");
        }
    }

    private String safe(String s) {
        return s == null ? "" : s;
    }

    private static class CheckResult {
        final boolean ok;
        final List<String> problems;
        final String retryInstruction;

        private CheckResult(
                boolean ok,
                List<String> problems,
                String retryInstruction
        ) {
            this.ok = ok;
            this.problems = problems;
            this.retryInstruction = retryInstruction;
        }
    }

    private boolean isGreeting(String s) {
        if (s == null) return false;

        String x = s.trim().toLowerCase(Locale.ROOT);

        return x.equals("hi")
                || x.equals("hello")
                || x.equals("hey")
                || x.equals("thanks")
                || x.equals("thank you")
                || x.equals("good morning")
                || x.equals("good evening")
                || x.equals("good afternoon");
    }
}
