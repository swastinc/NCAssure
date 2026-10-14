package com.nathcorp.QAPortal.service;

import com.microsoft.aad.msal4j.*;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.JWSKeySelector;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import com.nathcorp.QAPortal.util.AuthorizationUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import java.net.MalformedURLException;
import java.net.URL;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletionException;

@Service
public class OboTokenService {

    private static final String AZURE_DEVOPS_AUDIENCE =
            "499b84ac-1321-427f-aa17-267ca6975798";

    @Value("${azuread.client-id}")
    private String clientId;

    @Value("${azuread.client-secret}")
    private String clientSecret;

    @Value("${azuread.tenant-id}")
    private String tenantId;

    @Value("${azuread.allowed-audiences:}")
    private String allowedAudiences;

    private static final long CLOCK_SKEW_SECONDS = 60;

    private final Object jwkSourceLock = new Object();
    private volatile RemoteJWKSet<SecurityContext> cachedJwkSource;
    private volatile String cachedJwksUrl;

    private final Object confidentialClientLock = new Object();
    private volatile ConfidentialClientApplication cachedConfidentialClient;
    private volatile String cachedConfidentialClientKey;

    private ConfidentialClientApplication buildApp() throws MalformedURLException {
        String cacheKey =
                String.valueOf(clientId) + "|" +
                        String.valueOf(tenantId);

        ConfidentialClientApplication app = cachedConfidentialClient;

        if (app != null && cacheKey.equals(cachedConfidentialClientKey)) {
            return app;
        }

        synchronized (confidentialClientLock) {
            app = cachedConfidentialClient;

            if (app != null && cacheKey.equals(cachedConfidentialClientKey)) {
                return app;
            }


            app = ConfidentialClientApplication.builder(
                            clientId,
                            ClientCredentialFactory.createFromSecret(clientSecret)
                    )
                    .authority("https://login.microsoftonline.com/" + tenantId)
                    .build();

            cachedConfidentialClient = app;
            cachedConfidentialClientKey = cacheKey;

            return app;
        }
    }

    private RemoteJWKSet<SecurityContext> getJwkSource() throws MalformedURLException {
        if (!StringUtils.hasText(tenantId)) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Azure AD tenant id is not configured."
            );
        }

        String jwksUrl =
                "https://login.microsoftonline.com/" + tenantId + "/discovery/v2.0/keys";

        RemoteJWKSet<SecurityContext> jwkSource = cachedJwkSource;

        if (jwkSource != null && jwksUrl.equals(cachedJwksUrl)) {
            return jwkSource;
        }

        synchronized (jwkSourceLock) {
            jwkSource = cachedJwkSource;

            if (jwkSource != null && jwksUrl.equals(cachedJwksUrl)) {
                return jwkSource;
            }


            jwkSource = new RemoteJWKSet<>(new URL(jwksUrl));

            cachedJwkSource = jwkSource;
            cachedJwksUrl = jwksUrl;

            return jwkSource;
        }
    }

    public String getAdoAccessToken(String authorizationHeader) {

        String userAccessToken = extractTokenFromHeader(authorizationHeader);


        JWTClaimsSet claims = validateAndGetClaims(authorizationHeader, true);

        if (isAzureDevOpsAudience(claims)) {
            return userAccessToken;
        }

        Set<String> scopes = Collections.singleton(
                "499b84ac-1321-427f-aa17-267ca6975798/.default"
        );


        String adoToken = acquireTokenObo(userAccessToken, scopes);


        return adoToken;
    }

    public String getGraphAccessToken(String authorizationHeader) {

        String userAccessToken = extractTokenFromHeader(authorizationHeader);


        validateAndGetClaims(authorizationHeader);

        Set<String> scopes = Collections.singleton(
                "https://graph.microsoft.com/.default"
        );


        String graphToken = acquireTokenObo(userAccessToken, scopes);


        return graphToken;
    }

    public String getUserEmail(String authorizationHeader) {

        JWTClaimsSet claims = validateAndGetClaims(authorizationHeader);

        String email = firstNonBlankClaim(
                claims,
                "preferred_username",
                "email",
                "upn",
                "unique_name"
        );


        if (email == null || email.isBlank()) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Email claim not found in user token."
            );
        }


        return email;
    }

    public String getUserEmailOrFallback(String authorizationHeader) {

        String email = getUserEmail(authorizationHeader);


        return email;
    }

    public String getUserName(String authorizationHeader) {

        JWTClaimsSet claims = validateAndGetClaims(authorizationHeader);

        String name = firstNonBlankClaim(
                claims,
                "name",
                "preferred_username",
                "email",
                "upn",
                "unique_name"
        );


        if (name == null || name.isBlank()) {
            return "Unknown User";
        }


        return name;
    }

    public String getUserNameOrFallback(String authorizationHeader) {

        String name = getUserName(authorizationHeader);


        return name;
    }

    public String requireAuthorizationHeader(String authorizationHeader) {

        String requiredHeader = AuthorizationUtils.requireBearerAuthorization(authorizationHeader);

        validateAndGetClaims(requiredHeader);


        return requiredHeader;
    }

    public String requireBackendOrAdoAuthorizationHeader(String authorizationHeader) {

        String requiredHeader = AuthorizationUtils.requireBearerAuthorization(authorizationHeader);

        validateAndGetClaims(requiredHeader, true);


        return requiredHeader;
    }

    private JWTClaimsSet validateAndGetClaims(String authorizationHeader) {
        return validateAndGetClaims(authorizationHeader, false);
    }

    private JWTClaimsSet validateAndGetClaims(
            String authorizationHeader,
            boolean allowAzureDevOpsAudience
    ) {

        String token = extractTokenFromHeader(authorizationHeader);


        printUnverifiedJwtDebug(token);

        try {
            RemoteJWKSet<SecurityContext> jwkSource = getJwkSource();


            JWSKeySelector<SecurityContext> keySelector =
                    new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, jwkSource);

            DefaultJWTProcessor<SecurityContext> jwtProcessor =
                    new DefaultJWTProcessor<>();

            jwtProcessor.setJWSKeySelector(keySelector);


            JWTClaimsSet claims = jwtProcessor.process(token, null);


            validateIssuer(claims);

            if (allowAzureDevOpsAudience && isAzureDevOpsAudience(claims)) {
            } else {
                validateAudience(claims);
            }

            validateTenant(claims);

            validateExpiry(claims);

            validateNotBefore(claims);


            return claims;

        } catch (ResponseStatusException ex) {
            ex.printStackTrace();


            throw ex;

        } catch (Exception ex) {
            ex.printStackTrace();


            if (isJwksFetchFailure(ex)) {
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "Unable to verify user token because Microsoft signing keys are temporarily unavailable.",
                        ex
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "The user token is invalid or not trusted.",
                    ex
            );
        }
    }

    private boolean isAzureDevOpsAudience(JWTClaimsSet claims) {
        List<String> audiences = claims != null ? claims.getAudience() : null;

        return audiences != null &&
                audiences.stream()
                        .filter(value -> value != null && !value.isBlank())
                        .anyMatch(value -> value.equalsIgnoreCase(AZURE_DEVOPS_AUDIENCE));
    }

    private void validateIssuer(JWTClaimsSet claims) {

        String issuer = claims.getIssuer();

        String v2Issuer =
                "https://login.microsoftonline.com/" + tenantId + "/v2.0";

        String v1Issuer =
                "https://sts.windows.net/" + tenantId + "/";


        boolean validIssuer =
                issuer != null &&
                        (issuer.equalsIgnoreCase(v2Issuer)
                                || issuer.equalsIgnoreCase(v1Issuer));


        if (!validIssuer) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid token issuer."
            );
        }

    }

    private void validateAudience(JWTClaimsSet claims) {

        List<String> audiences = claims.getAudience();

        Set<String> expectedAudiences = new LinkedHashSet<>();
        expectedAudiences.add(clientId);
        expectedAudiences.add("api://" + clientId);

        if (allowedAudiences != null && !allowedAudiences.isBlank()) {
            Arrays.stream(allowedAudiences.split(","))
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .forEach(expectedAudiences::add);
        }


        if (audiences != null) {
            for (String audience : audiences) {
            }
        }

        boolean validAudience =
                audiences != null &&
                        audiences.stream().anyMatch(expectedAudiences::contains);


        if (!validAudience) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid token audience. Expected a QA Portal backend API token."
            );
        }

    }

    private void validateTenant(JWTClaimsSet claims) {

        try {
            String tokenTenantId = claims.getStringClaim("tid");


            boolean validTenant =
                    tokenTenantId != null &&
                            tokenTenantId.equalsIgnoreCase(tenantId);


            if (!validTenant) {

                throw new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Invalid token tenant."
                );
            }


        } catch (ResponseStatusException ex) {
            throw ex;

        } catch (Exception ex) {
            ex.printStackTrace();


            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Tenant claim not found in user token.",
                    ex
            );
        }
    }

    private void validateExpiry(JWTClaimsSet claims) {

        Date expiry = claims.getExpirationTime();


        if (expiry == null) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Token expiry claim not found."
            );
        }

        Instant now = Instant.now();

        boolean expired = expiry.toInstant().plusSeconds(CLOCK_SKEW_SECONDS).isBefore(now);


        if (expired) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "The user token is expired."
            );
        }

    }

    private void validateNotBefore(JWTClaimsSet claims) {

        Date notBefore = claims.getNotBeforeTime();


        if (notBefore == null) {
            return;
        }

        Instant now = Instant.now();

        boolean notValidYet = notBefore.toInstant().minusSeconds(CLOCK_SKEW_SECONDS).isAfter(now);


        if (notValidYet) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "The user token is not valid yet."
            );
        }

    }

    private String extractTokenFromHeader(String authorizationHeader) {

        try {
            String token = AuthorizationUtils.extractBearerToken(authorizationHeader);


            if (token != null) {
                String[] jwtParts = token.split("\\.");

                if (jwtParts.length != 3) {
                }
            }


            return token;

        } catch (Exception ex) {
            ex.printStackTrace();

            throw ex;
        }
    }

    private String firstNonBlankClaim(JWTClaimsSet claims, String... claimNames) {

        for (String claimName : claimNames) {
            try {
                Object value = claims.getClaim(claimName);


                if (value != null) {
                    String text = value.toString();

                    if (!text.isBlank()) {

                        return text;
                    }
                }

            } catch (Exception ex) {
            }
        }


        return null;
    }

    private String acquireTokenObo(String userAccessToken, Set<String> scopes) {

        try {
            ConfidentialClientApplication app = buildApp();


            UserAssertion userAssertion = new UserAssertion(userAccessToken);


            OnBehalfOfParameters params =
                    OnBehalfOfParameters.builder(scopes, userAssertion).build();


            IAuthenticationResult result = app.acquireToken(params).join();

            String accessToken = result.accessToken();






            return result.accessToken();

        } catch (CompletionException ex) {

            Throwable cause = ex.getCause() != null ? ex.getCause() : ex;

            cause.printStackTrace();


            if (cause instanceof MsalServiceException serviceException) {
                throw mapMsalExceptionToResponse(serviceException);
            }

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "The user token is expired or invalid.",
                    cause
            );

        } catch (MsalServiceException ex) {
            ex.printStackTrace();


            throw mapMsalExceptionToResponse(ex);

        } catch (Exception ex) {
            ex.printStackTrace();


            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "OBO token acquisition failed: " + ex.getMessage(),
                    ex
            );
        }
    }


    public byte[] getCurrentUserPhoto(String authorizationHeader) {


        // Step 1: Get Graph Access Token
        String graphToken = getGraphAccessToken(authorizationHeader);


        // Step 2: Decode token locally
        try {
            SignedJWT jwt = SignedJWT.parse(graphToken);
            JWTClaimsSet claims = jwt.getJWTClaimsSet();


        } catch (Exception ex) {
            ex.printStackTrace();
        }

        // Step 3: Create HTTP request
        HttpHeaders headers = new HttpHeaders();

        // Use manual header instead of setBearerAuth()
        headers.add(HttpHeaders.AUTHORIZATION, "Bearer " + graphToken);


        HttpEntity<Void> entity = new HttpEntity<>(headers);

        RestTemplate restTemplate = new RestTemplate();

        // Step 4: Test Microsoft Graph /me
        try {


            ResponseEntity<String> meResponse = restTemplate.exchange(
                    "https://graph.microsoft.com/v1.0/me",
                    HttpMethod.GET,
                    entity,
                    String.class
            );


        } catch (HttpStatusCodeException ex) {


            throw ex;
        }

        // Step 5: Get Profile Photo
        try {


            ResponseEntity<byte[]> photoResponse = restTemplate.exchange(
                    "https://graph.microsoft.com/v1.0/me/photo/$value",
                    HttpMethod.GET,
                    entity,
                    byte[].class
            );



            return photoResponse.getBody();

        } catch (HttpStatusCodeException ex) {


            throw ex;
        }
    }
    private ResponseStatusException mapMsalExceptionToResponse(MsalServiceException ex) {

        String errorCode = ex.errorCode();
        String message = ex.getMessage();


        boolean invalidOrExpiredToken =
                contains(errorCode, "invalid_grant")
                        || contains(errorCode, "invalid_token")
                        || contains(errorCode, "interaction_required")
                        || contains(message, "AADSTS50013")
                        || contains(message, "AADSTS500133")
                        || contains(message, "AADSTS70008")
                        || contains(message, "AADSTS700082")
                        || contains(message, "expired")
                        || contains(message, "invalid");


        if (invalidOrExpiredToken) {

            return new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "The user token is expired or invalid.",
                    ex
            );
        }


        return new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "OBO token acquisition failed: " + ex.getMessage(),
                ex
        );
    }

    private boolean isJwksFetchFailure(Throwable ex) {
        Throwable current = ex;

        while (current != null) {
            String className = current.getClass().getName();
            String message = current.getMessage();

            if (current instanceof java.io.IOException ||
                    className.contains("RemoteKeySourceException") ||
                    className.contains("KeySourceException") ||
                    contains(message, "Couldn't retrieve remote JWK set") ||
                    contains(message, "Remote JWK set") ||
                    contains(message, "discovery/v2.0/keys")) {
                return true;
            }

            current = current.getCause();
        }

        return false;
    }

    private boolean contains(String source, String keyword) {
        boolean result = source != null
                && keyword != null
                && source.toLowerCase().contains(keyword.toLowerCase());


        return result;
    }

    private void printUnverifiedJwtDebug(String token) {

        try {
            if (!StringUtils.hasText(token)) {
                return;
            }

            SignedJWT signedJWT = SignedJWT.parse(token);


            JWTClaimsSet unverifiedClaims = signedJWT.getJWTClaimsSet();



        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }

    private String maskToken(String token) {
        if (!StringUtils.hasText(token)) {
            return "null-or-blank";
        }

        if (token.length() <= 20) {
            return "***";
        }

        return token.substring(0, 10) + "..." + token.substring(token.length() - 10);
    }
}