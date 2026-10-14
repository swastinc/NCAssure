package com.nathcorp.QAPortal.config;

import com.nathcorp.QAPortal.components.UserTokenStore;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Service
public class SharePointGraphService {

    private final RestTemplate restTemplate;
    private final UserTokenStore tokenStore;

    private static final String GRAPH_BASE = "https://graph.microsoft.com/v1.0";

    public SharePointGraphService(RestTemplate restTemplate, UserTokenStore tokenStore) {
        this.restTemplate = restTemplate;
        this.tokenStore = tokenStore;
    }

    /** 1) sharing link -> driveItem metadata (driveId + itemId) */
    public DriveItemInfo resolveDriveItemFromSharingUrl(String sharingUrl) {
        String token = requireGraphToken();
        String shareToken = toShareToken(sharingUrl);

        String url = GRAPH_BASE + "/shares/" + shareToken
                + "/driveItem?$select=id,name,parentReference,file,lastModifiedDateTime";

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));

        ResponseEntity<DriveItemInfo> resp = restTemplate.exchange(
                url,
                HttpMethod.GET,
                new HttpEntity<>(headers),
                DriveItemInfo.class
        );

        return resp.getBody();
    }

    /** 2) driveId+itemId -> bytes (Graph returns 302 redirect often; handle it) */
    public byte[] downloadDriveItemContent(String driveId, String itemId) {
        String token = requireGraphToken();

        String url = GRAPH_BASE + "/drives/" + driveId + "/items/" + itemId + "/content";

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(java.util.List.of(MediaType.APPLICATION_OCTET_STREAM));

        ResponseEntity<byte[]> resp = restTemplate.exchange(
                url,
                HttpMethod.GET,
                new HttpEntity<>(headers),
                byte[].class
        );

        // If Graph responds with redirect to pre-auth download URL
        if (resp.getStatusCode().is3xxRedirection()) {
            String redirect = resp.getHeaders().getFirst(HttpHeaders.LOCATION);
            if (redirect == null || redirect.isBlank()) {
                throw new RuntimeException("Graph content redirect missing Location header.");
            }
            // redirect URL is pre-auth; do NOT send bearer token
            return restTemplate.getForObject(redirect, byte[].class);
        }

        if (!resp.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("Failed to download content. HTTP " + resp.getStatusCode());
        }

        return resp.getBody();
    }

    // Microsoft share token rule: base64(url) -> base64url (no padding) and prefix "u!"
    private static String toShareToken(String url) {
        String b64 = Base64.getEncoder().encodeToString(url.getBytes(StandardCharsets.UTF_8));
        String b64url = b64.replace("+", "-").replace("/", "_").replace("=", "");
        return "u!" + b64url;
    }

    private String requireGraphToken() {
        String token = tokenStore.getGraphToken();
        if (token == null || token.isBlank()) {
            throw new RuntimeException("Graph token missing in UserTokenStore. Please login/refresh Graph token.");
        }
        return token.trim();
    }

    // ===== DTOs (match Graph response) =====
    public static class DriveItemInfo {
        private String id;
        private String name;
        private ParentReference parentReference;
        // in SharePointGraphService.DriveItemInfo
        private String lastModifiedDateTime;

        public String getLastModifiedDateTime() { return lastModifiedDateTime; }
        public void setLastModifiedDateTime(String lastModifiedDateTime) { this.lastModifiedDateTime = lastModifiedDateTime; }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public ParentReference getParentReference() { return parentReference; }
        public void setParentReference(ParentReference parentReference) { this.parentReference = parentReference; }
    }

    public static class ParentReference {
        private String driveId;

        public String getDriveId() { return driveId; }
        public void setDriveId(String driveId) { this.driveId = driveId; }
    }
}
