package com.nathcorp.QAPortal.controller;

import com.microsoft.graph.models.BodyType;
import com.microsoft.graph.models.ChatMessage;
import com.microsoft.graph.models.ItemBody;
import com.microsoft.graph.serviceclient.GraphServiceClient;
import com.nathcorp.QAPortal.dto.TeamsMessageRequest;
import com.nathcorp.QAPortal.dto.TeamWithChannelsResponse;
import com.nathcorp.QAPortal.service.ActivityLogService;
import com.nathcorp.QAPortal.service.BuildHistoryService;
import com.nathcorp.QAPortal.service.OboTokenService;
import com.nathcorp.QAPortal.service.TeamsMessageService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/teams")
public class TeamsController {

    private final TeamsMessageService teamsMessageService;
    private final GraphServiceClient client;
    private final BuildHistoryService buildHistoryService;
    private final OboTokenService tokenStore;
    private final ActivityLogService logService;

    public TeamsController(
            TeamsMessageService teamsMessageService,
            GraphServiceClient client,
            BuildHistoryService buildHistoryService,
            OboTokenService tokenStore,
            ActivityLogService logService
    ) {
        this.teamsMessageService = teamsMessageService;
        this.client = client;
        this.buildHistoryService = buildHistoryService;
        this.tokenStore = tokenStore;
        this.logService = logService;
    }

    @GetMapping("/teams/my")
    public ResponseEntity<Map<String, Object>> myTeams(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        var teams = client.me().joinedTeams().get().getValue();

        return ResponseEntity.ok(
                Map.of(
                        "count", teams.size(),
                        "value", teams
                )
        );
    }

    @PostMapping("/sendMessage")
    public ResponseEntity<String> sendMessage(

            @RequestBody TeamsMessageRequest body,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        String validAuthorizationHeader =
                validateAuthorization(authorizationHeader);

        String currentUserEmail =
                getCurrentUserEmail(validAuthorizationHeader);

        String currentUserName =
                getCurrentUserName(validAuthorizationHeader);

        var build =
                buildHistoryService.getBuildByProjectId(body.getProjectId());

        if (build == null) {

            return ResponseEntity
                    .status(HttpStatus.NOT_FOUND)
                    .body("Build not found");
        }

        String projectName =
                build.getProjectName();

        String buildVersion =
                build.getBuildVersion();

        String releaseBy =
                build.getReleasedBy();

        String releaseNoteUrl =
                build.getReleaseNoteUrl();

        String description =
                build.getDescription();

        String buildUrl =
                build.getBuildUrl();

        String buildName =
                build.getBuilds();

        String remarksHtml =
                escText(body.getRemarks()).replace("\n", "<br/>");

        String descHtml =
                escText(description).replace("\n", "<br/>");

        String releaseHref =
                escHtmlAttr(normalizeHref(releaseNoteUrl));

        String buildHref =
                escHtmlAttr(normalizeHref(buildUrl));

        String releaseUrlText =
                escText(normalizeHref(releaseNoteUrl));

        String buildUrlText =
                escText(normalizeHref(buildUrl));

        String messageHtml =
                "<div style=\"font-size:14px; line-height:1.4\">" +
                        "<div><b>Build Released</b></div><br/>" +
                        "<div>Hello Team,</div>" +
                        "<div>The latest build has been released and validated and is now available for QA.</div><br/>" +

                        "<div><b>Build Details</b></div>" +
                        "<ul style=\"margin:6px 0 0 18px; padding:0\">" +
                        "<li><b>Project:</b> " + escText(projectName) + "</li>" +
                        "<li><b>Version:</b> " + escText(buildVersion) + "</li>" +
                        "<li><b>Build:</b> " + escText(buildName) + "</li>" +
                        "<li><b>Released by:</b> " + escText(releaseBy) + "</li>" +
                        "<li><b>Release Note:</b> <a href=\"" + releaseHref + "\">Open</a></li>" +
                        "<li><b>Build URL:</b> <a href=\"" + buildHref + "\">Open</a></li>" +
                        "</ul>" +

                        "<div style=\"margin-top:6px\"><b>Release Note URL:</b> " + releaseUrlText + "</div>" +
                        "<div><b>Build URL:</b> " + buildUrlText + "</div>" +

                        "<br/>" +
                        "<div><b>Description</b></div>" +
                        "<div>" + (descHtml.isBlank() ? "—" : descHtml) + "</div><br/>" +

                        "<div><b>Remarks</b></div>" +
                        "<div>" + (remarksHtml.isBlank() ? "—" : remarksHtml) + "</div><br/>" +

                        "<div>Thank you.</div>" +
                        "</div>";

        ChatMessage msg = new ChatMessage();

        ItemBody item = new ItemBody();

        item.setContentType(BodyType.Html);

        item.setContent(messageHtml);

        msg.setBody(item);

        client.teams()
                .byTeamId(body.getTeamId())
                .channels()
                .byChannelId(body.getChannelId())
                .messages()
                .post(msg);

        logService.log(
                "TEAMS BUILD MESSAGE SENT",
                currentUserEmail,
                LocalDateTime.now()
                        + " TEAMS BUILD MESSAGE SENT"
                        + " | Project: " + projectName
                        + " | Version: " + buildVersion
                        + " | By: " + currentUserName
        );

        return ResponseEntity.ok("Message sent!");
    }

    @PostMapping("/sendSignOffMessage")
    public ResponseEntity<String> sendSignOffMessage(

            @RequestBody TeamsMessageRequest body,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        String validAuthorizationHeader =
                validateAuthorization(authorizationHeader);

        String currentUserEmail =
                getCurrentUserEmail(validAuthorizationHeader);

        String currentUserName =
                getCurrentUserName(validAuthorizationHeader);

        String project =
                body.getProject();

        String version =
                body.getVersion();

        String completed =
                body.getCompletedBy();

        String date =
                body.getDateChanged();

        String pdf =
                body.getSignOffPdfLink();

        String remarksHtml =
                esc(body.getRemarks()).replace("\n", "<br/>");

        String messageHtml =
                "<div style='font-size:14px; line-height:1.4'>" +
                        "<div><b>QA Sign-off Released</b></div>" +
                        "<br/>" +
                        "<div>Hello Team,</div>" +
                        "<div>The QA sign-off has been approved and released.</div>" +
                        "<br/>" +
                        "<ul style='margin:6px 0 0 18px; padding:0'>" +
                        "<li><b>Project:</b> " + esc(project) + "</li>" +
                        "<li><b>Version:</b> " + esc(version) + "</li>" +
                        "<li><b>Build:</b> " + esc(version) + "</li>" +
                        "<li><b>Completed By:</b> " + esc(completed) + "</li>" +
                        "<li><b>Date Changed:</b> " + esc(date) + "</li>" +
                        (pdf == null || pdf.isBlank()
                                ? ""
                                : "<li><b>Sign-off PDF:</b> <a href='" + escUrl(pdf) + "'>Open</a></li>") +
                        "</ul>" +
                        (remarksHtml.isBlank()
                                ? ""
                                : "<br/><div><b>Remarks</b></div><div>" + remarksHtml + "</div>") +
                        "<br/>" +
                        "<div>Thank you.</div>" +
                        "</div>";

        ChatMessage msg = new ChatMessage();

        ItemBody item = new ItemBody();

        item.setContentType(BodyType.Html);

        item.setContent(messageHtml);

        msg.setBody(item);

        client.teams()
                .byTeamId(body.getTeamId())
                .channels()
                .byChannelId(body.getChannelId())
                .messages()
                .post(msg);

        logService.log(
                "TEAMS SIGNOFF MESSAGE SENT",
                currentUserEmail,
                LocalDateTime.now()
                        + " TEAMS SIGNOFF MESSAGE SENT"
                        + " | Project: " + project
                        + " | Version: " + version
                        + " | By: " + currentUserName
        );

        return ResponseEntity.ok("Message sent!");
    }

    @GetMapping("/allchannels")
    public ResponseEntity<List<TeamWithChannelsResponse>> getAllTeamsWithChannels(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        List<TeamWithChannelsResponse> data =
                teamsMessageService.getAllTeamsWithChannels();

        return ResponseEntity.ok(data);
    }

    private String validateAuthorization(
            String authorizationHeader
    ) {
        return tokenStore.requireAuthorizationHeader(authorizationHeader);
    }

    private static String esc(String s) {

        if (s == null) {
            return "";
        }

        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String escUrl(String s) {

        return esc(s);
    }

    private static String escText(String s) {

        if (s == null) {
            return "";
        }

        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String escHtmlAttr(String s) {

        if (s == null) {
            return "";
        }

        return s.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private static String normalizeHref(String raw) {

        if (raw == null) {
            return "";
        }

        String u = raw.trim();

        if (u.isEmpty()) {
            return "";
        }

        if (!u.matches("(?i)^https?://.*")) {
            u = "https://" + u;
        }

        u = u.replace(" ", "%20");

        return u;
    }

    private String getCurrentUserEmail(String authorizationHeader) {
        return tokenStore.getUserEmailOrFallback(authorizationHeader);
    }

    private String getCurrentUserName(String authorizationHeader) {
        return tokenStore.getUserNameOrFallback(authorizationHeader);
    }
}
