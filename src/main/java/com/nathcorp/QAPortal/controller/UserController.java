package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.dto.User;
import com.nathcorp.QAPortal.dto.UpdateUserRoleRequest;
import com.nathcorp.QAPortal.repository.BuildHistoryRepository;
import com.nathcorp.QAPortal.repository.SignoffRepository;
import com.nathcorp.QAPortal.service.ActivityLogService;
import com.nathcorp.QAPortal.service.OboTokenService;
import com.nathcorp.QAPortal.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    @Autowired
    private ActivityLogService logService;

    @Autowired
    private OboTokenService oboTokenService;

    @Autowired
    private BuildHistoryRepository buildHistoryRepository;

    @Autowired
    private SignoffRepository signoffRepository;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    public ResponseEntity<User> createUser(

            @RequestBody User user,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        if (user.getEmail() == null || user.getEmail().isBlank()) {
            return ResponseEntity.badRequest().body(null);
        }

        User existingUser =
                userService.getUserByEmail(user.getEmail());

        if (existingUser != null) {
            return ResponseEntity.ok(existingUser);
        }

        User savedUser =
                userService.saveUser(user);

        return ResponseEntity.ok(savedUser);
    }

    @GetMapping
    public List<User> getAllUsers(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return userService.getAllUsers();
    }

    @GetMapping("/{email}")
    public User getUserByEmail(

            @PathVariable String email,

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return userService.getUserByEmail(email);
    }

    @PutMapping("/role")
    public ResponseEntity<User> updateUserRole(

            @RequestBody UpdateUserRoleRequest request,

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

        User existingUser =
                userService.getUserByEmail(request.getEmail());

        if (existingUser == null) {
            return ResponseEntity.badRequest().body(null);
        }

        String previousRole =
                existingUser.getRole();

        User updatedUser =
                userService.updateUserRole(
                        request.getEmail(),
                        request.getRole()
                );

        String newRole =
                request.getRole();

        logService.log(
                "ROLE UPDATED",
                currentUserEmail,
                LocalDateTime.now() +
                        " ROLE UPDATED | User: " +
                        existingUser.getName() +
                        " | Previous Role: " +
                        previousRole +
                        " | New Role: " +
                        newRole +
                        " | Updated By: " +
                        currentUserName
        );

        return ResponseEntity.ok(updatedUser);
    }

    @GetMapping("/qaprivileged")
    public ResponseEntity<Iterable<User>> getAdminsAndQaManagers(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(
                userService.getUsersByRoles(
                        "ADMIN",
                        "QAMANAGER"
                )
        );
    }

    @GetMapping("/devmanagers")
    public ResponseEntity<Iterable<User>> getDevManagers(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(
                userService.getUsersByRoles(
                        "ADMIN",
                        "DEVMANAGER"
                )
        );
    }

    @GetMapping("/qaengprivileged")
    public ResponseEntity<Iterable<User>> getQaEngineers(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        validateAuthorization(authorizationHeader);

        return ResponseEntity.ok(
                userService.getUsersByRoles(
                        "QAENGINEER"
                )
        );
    }

    // ============================================================
    // NOTIFICATIONS: BUILD APPROVALS
    // ============================================================

    @GetMapping("/notifications/build-approvals/unread-count")
    public ResponseEntity<Map<String, Object>> buildApprovalUnreadCount(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        String validAuthorizationHeader =
                validateAuthorization(authorizationHeader);

        String email =
                getCurrentUserEmail(validAuthorizationHeader);

        User user =
                userService.getUserByEmail(email);

        if (user == null) {

            return ResponseEntity
                    .badRequest()
                    .body(Map.of(
                            "count", 0,
                            "error", "User not found"
                    ));
        }

        String role =
                user.getRole();

        String lastSeen =
                user.getLastSeenBuildApprovalAt();

        if (lastSeen == null || lastSeen.isBlank()) {
            lastSeen = "1970-01-01T00:00:00Z";
        }

        long count;

        if ("DEVMANAGER".equalsIgnoreCase(role)) {

            count =
                    buildHistoryRepository
                            .countPendingApprovalsAfterForDevManager(
                                    email,
                                    lastSeen
                            );

        } else if ("ADMIN".equalsIgnoreCase(role)) {

            count =
                    buildHistoryRepository
                            .countPendingApprovalsAfter(lastSeen);

        } else {

            count = 0;
        }

        return ResponseEntity.ok(
                Map.of("count", count)
        );
    }

    @PostMapping("/notifications/build-approvals/mark-seen")
    public ResponseEntity<Map<String, Object>> markBuildApprovalsSeen(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        String validAuthorizationHeader =
                validateAuthorization(authorizationHeader);

        String email =
                getCurrentUserEmail(validAuthorizationHeader);

        User user =
                userService.getUserByEmail(email);

        if (user == null) {

            return ResponseEntity
                    .badRequest()
                    .body(Map.of(
                            "ok", false,
                            "error", "User not found"
                    ));
        }

        String latest =
                buildHistoryRepository.latestPendingApprovalTime();

        String seenAt =
                latest != null && !latest.isBlank()
                        ? latest
                        : OffsetDateTime.now().toString();

        user.setLastSeenBuildApprovalAt(seenAt);

        userService.saveUser(user);

        return ResponseEntity.ok(
                Map.of("ok", true)
        );
    }

    // ============================================================
    // NOTIFICATIONS: SIGNOFF APPROVALS
    // ============================================================

    @GetMapping("/notifications/signoff-approvals/unread-count")
    public ResponseEntity<Map<String, Object>> signoffApprovalUnreadCount(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        String validAuthorizationHeader =
                validateAuthorization(authorizationHeader);

        String email =
                getCurrentUserEmail(validAuthorizationHeader);

        User user =
                userService.getUserByEmail(email);

        if (user == null) {

            return ResponseEntity
                    .badRequest()
                    .body(Map.of(
                            "count", 0,
                            "error", "User not found"
                    ));
        }

        String role =
                user.getRole();

        String lastSeen =
                user.getLastSeenSignOffApprovalAt();

        if (lastSeen == null || lastSeen.isBlank()) {
            lastSeen = "1970-01-01T00:00:00Z";
        }

        long count;

        if ("QAMANAGER".equalsIgnoreCase(role)) {

            count =
                    signoffRepository
                            .countPendingAfterForQaManager(
                                    email,
                                    lastSeen
                            );

        } else if ("ADMIN".equalsIgnoreCase(role)) {

            count =
                    signoffRepository
                            .countPendingAfter(lastSeen);

        } else {

            count = 0;
        }

        return ResponseEntity.ok(
                Map.of("count", count)
        );
    }

    @PostMapping("/notifications/signoff-approvals/mark-seen")
    public ResponseEntity<Map<String, Object>> markSignoffApprovalsSeen(

            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorizationHeader
    ) {

        String validAuthorizationHeader =
                validateAuthorization(authorizationHeader);

        String email =
                getCurrentUserEmail(validAuthorizationHeader);

        User user =
                userService.getUserByEmail(email);

        if (user == null) {

            return ResponseEntity
                    .badRequest()
                    .body(Map.of(
                            "ok", false,
                            "error", "User not found"
                    ));
        }

        String latest =
                signoffRepository.latestPendingCreatedAt();

        String seenAt =
                latest != null && !latest.isBlank()
                        ? latest
                        : OffsetDateTime.now().toString();

        user.setLastSeenSignOffApprovalAt(seenAt);

        userService.saveUser(user);

        return ResponseEntity.ok(
                Map.of("ok", true)
        );
    }

    @GetMapping("/photo")
    public ResponseEntity<byte[]> getCurrentUserPhoto(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorizationHeader) {

        byte[] photo = oboTokenService.getCurrentUserPhoto(authorizationHeader);

        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .body(photo);
    }

    private String validateAuthorization(
            String authorizationHeader
    ) {
        return oboTokenService.requireAuthorizationHeader(authorizationHeader);
    }

    private String getCurrentUserEmail(String authorizationHeader) {
        return oboTokenService.getUserEmailOrFallback(authorizationHeader);
    }

    private String getCurrentUserName(String authorizationHeader) {
        return oboTokenService.getUserNameOrFallback(authorizationHeader);
    }
}
