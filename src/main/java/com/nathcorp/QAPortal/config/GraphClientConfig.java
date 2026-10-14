package com.nathcorp.QAPortal.config;

import com.azure.core.credential.AccessToken;
import com.azure.core.credential.TokenCredential;
import com.azure.core.credential.TokenRequestContext;
import com.microsoft.graph.serviceclient.GraphServiceClient;
import com.nathcorp.QAPortal.components.UserTokenStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reactor.core.publisher.Mono;

import java.time.OffsetDateTime;

@Configuration
public class GraphClientConfig {

    @Bean
    public GraphServiceClient graphClient(UserTokenStore tokenStore) {

        TokenCredential delegatedCredential = requestContext -> {
            String token = tokenStore.getGraphToken();
            if (token == null || token.isBlank()) {
                return Mono.error(new IllegalStateException("No GRAPH access token available in UserTokenStore"));
            }
            return Mono.just(new AccessToken(token, OffsetDateTime.now().plusMinutes(30)));
        };

        String[] scopes = new String[] { "https://graph.microsoft.com/.default" };
        return new GraphServiceClient(delegatedCredential, scopes);
    }
}