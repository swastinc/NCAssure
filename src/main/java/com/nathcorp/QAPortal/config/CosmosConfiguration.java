package com.nathcorp.QAPortal.config;

import com.azure.cosmos.CosmosClientBuilder;
import com.azure.spring.data.cosmos.config.AbstractCosmosConfiguration;
import com.azure.spring.data.cosmos.config.CosmosConfig;
import com.azure.spring.data.cosmos.repository.config.EnableCosmosRepositories;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Profile;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

@Configuration
@Profile("!test")
@EnableCosmosRepositories(basePackages = "com.nathcorp.QAPortal.repository")
public class CosmosConfiguration extends AbstractCosmosConfiguration {

    private final Environment env;

    public CosmosConfiguration(Environment env) {
        this.env = env;
    }

    /**
     * Supports BOTH property styles so your dev + staging work:
     * - spring.cloud.azure.cosmos.endpoint / key / database (newer)
     * - azure.spring.cosmos.uri / key / database (older)
     */
    @Value("${spring.cloud.azure.cosmos.endpoint:${azure.spring.cosmos.uri:}}")
    private String endpointOrUri;

    @Value("${spring.cloud.azure.cosmos.key:${azure.spring.cosmos.key:}}")
    private String key;

    @Value("${spring.cloud.azure.cosmos.database:${azure.spring.cosmos.database:}}")
    private String database;

    @Bean
    public CosmosClientBuilder cosmosClientBuilder() throws Exception {
        // Only for LOCAL emulator on dev profile (never for staging/prod)
        if (isDevProfile() && isEmulatorEndpoint(endpointOrUri)) {
            disableSslVerification();
        }

        return new CosmosClientBuilder()
                .endpoint(endpointOrUri)
                .key(key);
    }

    @Override
    public CosmosConfig cosmosConfig() {
        // Use your property if you want, but keep enabled for now
        return CosmosConfig.builder()
                .enableQueryMetrics(true)
                .build();
    }

    @Override
    protected String getDatabaseName() {
        return database;
    }

    private boolean isDevProfile() {
        for (String p : env.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(p)) return true;
        }
        return false;
    }

    private boolean isEmulatorEndpoint(String endpoint) {
        if (endpoint == null) return false;
        String e = endpoint.toLowerCase();
        return e.contains("localhost") || e.contains("127.0.0.1");
    }

    private static void disableSslVerification() throws Exception {
        TrustManager[] trustAllCerts = new TrustManager[]{
                new X509TrustManager() {
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                    public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                    public void checkServerTrusted(X509Certificate[] certs, String authType) {}
                }
        };
        SSLContext sc = SSLContext.getInstance("TLS");
        sc.init(null, trustAllCerts, new SecureRandom());
        HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
        HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);
    }
}
