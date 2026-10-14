package com.nathcorp.QAPortal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nathcorp.QAPortal.dto.AdSyncResponse;
import com.nathcorp.QAPortal.dto.User;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdSyncService {

    private final UserService userService;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public AdSyncService(UserService userService) {
        this.userService = userService;
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
    }

    public AdSyncResponse syncUsersFromAdGroup(
            String graphAccessToken,
            String groupId
    ) {

        if (!StringUtils.hasText(graphAccessToken)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Graph access token is missing."
            );
        }

        if (!StringUtils.hasText(groupId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "groupId is required."
            );
        }

        try {

            String url =
                    "https://graph.microsoft.com/v1.0/groups/"
                            + groupId
                            + "/members/microsoft.graph.user"
                            + "?$select=id,displayName,mail,userPrincipalName";


            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(graphAccessToken);
            headers.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));

            HttpEntity<String> entity = new HttpEntity<>(headers);

            ResponseEntity<String> response =
                    restTemplate.exchange(
                            url,
                            HttpMethod.GET,
                            entity,
                            String.class
                    );


            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode users = root.get("value");

            int created = 0;
            int updated = 0;

            if (users != null && users.isArray()) {
                for (JsonNode node : users) {
                    String graphUserId = getText(node, "id");

                    String email = getText(node, "mail");
                    if (email == null || email.isBlank()) {
                        email = getText(node, "userPrincipalName");
                    }

                    if (email == null || email.isBlank()) {
                        continue;
                    }

                    if (graphUserId == null || graphUserId.isBlank()) {
                        continue;
                    }

                    User existing = userService.getUserByEmail(email);
                    User user = existing != null ? existing : new User();

                    if (existing == null || user.getId() == null || user.getId().isBlank()) {
                        user.setId(graphUserId);
                    }

                    user.setEmail(email);
                    user.setName(getText(node, "displayName"));

                    if (user.getRole() == null || user.getRole().isBlank()) {
                        user.setRole("DEFAULTUSER");
                    }

                    userService.saveUser(user);

                    if (existing == null) {
                        created++;
                    } else {
                        updated++;
                    }
                }
            }

            AdSyncResponse result = new AdSyncResponse();
            result.setTotalUsersFetched(users != null ? users.size() : 0);
            result.setNewUsersCreated(created);
            result.setExistingUsersUpdated(updated);


            return result;

        } catch (HttpClientErrorException.BadRequest ex) {
            String graphError = ex.getResponseBodyAsString();

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Microsoft Graph Bad Request: " + graphError
            );

        } catch (HttpClientErrorException.Unauthorized ex) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Graph token expired or invalid."
            );

        } catch (HttpClientErrorException.Forbidden ex) {

            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Insufficient Microsoft Graph permissions to read group members."
            );

        } catch (HttpClientErrorException.NotFound ex) {

            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Group not found in Microsoft Entra ID."
            );

        } catch (HttpClientErrorException ex) {

            throw new ResponseStatusException(
                    HttpStatus.valueOf(ex.getStatusCode().value()),
                    "Microsoft Graph request failed: " + ex.getResponseBodyAsString()
            );

        } catch (ResponseStatusException ex) {
            throw ex;

        } catch (Exception ex) {
            ex.printStackTrace();

            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to sync AD users: " + ex.getMessage()
            );
        }
    }

    private String getText(JsonNode node, String field) {
        JsonNode value = node.get(field);

        if (value == null || value.isNull()) {
            return null;
        }

        return value.asText();
    }
}