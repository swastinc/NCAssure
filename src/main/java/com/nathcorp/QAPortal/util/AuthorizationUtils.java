package com.nathcorp.QAPortal.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

public final class AuthorizationUtils {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private AuthorizationUtils() {
    }

    public static String requireBearerAuthorization(String authorizationHeader) {
        if (!StringUtils.hasText(authorizationHeader)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Missing Authorization header"
            );
        }

        String trimmedHeader = authorizationHeader.trim();

        if (!trimmedHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid Authorization header. Expected Bearer token."
            );
        }

        String token = trimmedHeader.substring("Bearer ".length()).trim();

        if (!StringUtils.hasText(token)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Bearer token is empty"
            );
        }

        return trimmedHeader;
    }

    public static String extractBearerToken(String authorizationHeader) {
        String validAuthorizationHeader = requireBearerAuthorization(authorizationHeader);
        return validAuthorizationHeader.substring("Bearer ".length()).trim();
    }

    public static String firstNonBlankClaim(
            String authorizationHeader,
            String... claimNames
    ) {
        Map<String, Object> payload = decodeJwtPayload(authorizationHeader);

        for (String claimName : claimNames) {
            Object value = payload.get(claimName);

            if (value != null) {
                String text = value.toString().trim();

                if (!text.isEmpty()) {
                    return text;
                }
            }
        }

        return null;
    }

    public static Map<String, Object> decodeJwtPayload(String authorizationHeader) {
        try {
            String token = extractBearerToken(authorizationHeader);
            String[] parts = token.split("\\.");

            if (parts.length < 2) {
                return Map.of();
            }

            String json = new String(
                    Base64.getUrlDecoder().decode(parts[1]),
                    StandardCharsets.UTF_8
            );

            return OBJECT_MAPPER.readValue(
                    json,
                    new TypeReference<Map<String, Object>>() {
                    }
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            return Map.of();
        }
    }
}
