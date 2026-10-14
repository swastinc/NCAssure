package com.nathcorp.QAPortal.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;


@Configuration
public class RestTemplateConfig {
    @Bean
    public RestTemplate restTemplate() {
        var f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(100_000);
        f.setReadTimeout(200_000);
        return new RestTemplate(f);
    }

    @Bean
    public RestClient.Builder restClientBuilder() {
        var f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(100_000);
        f.setReadTimeout(200_000);

        return RestClient.builder()
                .requestFactory(f);
    }
}
