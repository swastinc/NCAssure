package com.nathcorp.QAPortal.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.aad.msal4j.*;
import com.nathcorp.QAPortal.components.UserTokenStore;
import com.nathcorp.QAPortal.config.CurrentUserTokenStore;
import com.nathcorp.QAPortal.dto.AuthCodeRequest;
import com.nathcorp.QAPortal.dto.TokenRequest;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.MalformedURLException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletionException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Value("${azuread.client-id}")
    private String clientId;

    @Value("${azuread.client-secret}")
    private String clientSecret;

    @Value("${azuread.tenant-id}")
    private String tenantId;

    private final CurrentUserTokenStore tokenStore;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public AuthController(CurrentUserTokenStore tokenStore) {
        this.tokenStore = tokenStore;
    }

    private ConfidentialClientApplication buildApp() throws MalformedURLException {
        return ConfidentialClientApplication.builder(
                        clientId,
                        ClientCredentialFactory.createFromSecret(clientSecret)
                )
                .authority("https://login.microsoftonline.com/" + tenantId)
                .build();
    }

    @PostMapping("/exchangecode")
    public String exchangeCode(@RequestBody AuthCodeRequest body) {

        if (body == null || body.getCode() == null || body.getCode().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing authorization code");
        }
        if (body.getCodeVerifier() == null || body.getCodeVerifier().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing PKCE code_verifier");
        }

        try {
            ConfidentialClientApplication app = buildApp();

            // Azure DevOps scope
            Set<String> scopes = Collections.singleton(
                    "499b84ac-1321-427f-aa17-267ca6975798/.default"
            );

            AuthorizationCodeParameters params =
                    AuthorizationCodeParameters
                            .builder(body.getCode(), new URI("http://localhost:5173/auth/callback"))
                            .scopes(scopes)
                            .codeVerifier(body.getCodeVerifier())
                            .build();

            IAuthenticationResult result = app.acquireToken(params).join();

            tokenStore.saveAdoToken(result.accessToken());

            String userEmail = (result.account() != null) ? result.account().username() : "";

            tokenStore.setUserEmail(userEmail);

            // best-effort name from token itself (if present)
            String userName = extractUserNameFromJwt(result.accessToken());
            tokenStore.setUserName(userName);

            return "ADO Token Saved Successfully";

        } catch (CompletionException ex) {
            Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
            cause.printStackTrace();
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, cause.getMessage(), cause);
        } catch (Exception ex) {
            ex.printStackTrace();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Token exchange failed", ex);
        }
    }

    @PostMapping("/saveado")
    public String saveAdo(
            HttpServletRequest request,
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing Authorization header");
        }

        // ✅ Force Spring to create JSESSIONID
        request.getSession(true);

        String adoToken = authHeader.substring("Bearer ".length()).trim();

        String userEmail = extractUserEmailFromJwt(adoToken);
        String userName = extractUserNameFromJwt(adoToken);


        tokenStore.saveAdoToken(adoToken);
        tokenStore.setUserEmail(userEmail);
        tokenStore.setUserName(userName);

        return "ADO Token Saved Successfully" +
                (userEmail == null || userEmail.isBlank() ? "" : (" for " + userEmail));
    }

    // ---------------- JWT helpers ----------------

    private Map<String, Object> decodeJwtPayload(String jwt) {
        try {
            if (jwt == null) return Map.of();
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return Map.of();

            String payloadJson = new String(
                    Base64.getUrlDecoder().decode(parts[1]),
                    StandardCharsets.UTF_8
            );

            return MAPPER.readValue(payloadJson, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String s(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private String extractUserEmailFromJwt(String jwt) {
        Map<String, Object> payload = decodeJwtPayload(jwt);

        // Common claims: preferred_username (AAD), upn, email
        String preferred = s(payload.get("preferred_username"));
        if (!preferred.isBlank()) return preferred;

        String upn = s(payload.get("upn"));
        if (!upn.isBlank()) return upn;

        String email = s(payload.get("email"));
        if (!email.isBlank()) return email;

        return "";
    }

    private String extractUserNameFromJwt(String jwt) {
        Map<String, Object> payload = decodeJwtPayload(jwt);

        // Common: "name"
        String name = s(payload.get("name"));
        if (!name.isBlank()) return name;

        // Sometimes split names exist
        String given = s(payload.get("given_name"));
        String family = s(payload.get("family_name"));
        String full = (given + " " + family).trim();
        if (!full.isBlank()) return full;

        // fallback to something readable
        String preferred = s(payload.get("preferred_username"));
        if (!preferred.isBlank()) return preferred;

        String upn = s(payload.get("upn"));
        if (!upn.isBlank()) return upn;

        String unique = s(payload.get("unique_name"));
        if (!unique.isBlank()) return unique;

        return "";
    }

    // ---------------- existing endpoints ----------------

    @GetMapping("/adotoken")
    public Map<String, String> getAdoToken() {
        String token = tokenStore.getAdoToken();
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No ADO token saved");
        }
        return Map.of("token", token);
    }

    @GetMapping("/debugtoken")
    public String debugToken() {
        String t = tokenStore.getAdoToken();
        if (t == null || t.isBlank()) return "NO TOKEN IN STORE";
        return "TOKEN PRESENT, length=" + t.length();
    }

    @PostMapping("/savegraphtoken")
    public String saveGraphToken(
            HttpServletRequest request,
            @RequestBody TokenRequest body
    ) {
        if (body == null || body.getToken() == null || body.getToken().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing token");
        }

        // ✅ Force Spring to create/reuse JSESSIONID
        request.getSession(true);

        tokenStore.saveGraphToken(body.getToken());

        return "Graph token saved";
    }
}
