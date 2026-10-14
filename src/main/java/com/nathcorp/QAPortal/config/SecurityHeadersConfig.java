package com.nathcorp.QAPortal.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration
public class SecurityHeadersConfig {

    @Bean
    public FilterRegistrationBean<SecurityHeadersFilter> securityHeadersFilterRegistration() {
        FilterRegistrationBean<SecurityHeadersFilter> registration = new FilterRegistrationBean<>();

        registration.setFilter(new SecurityHeadersFilter());
        registration.addUrlPatterns("/*");
        registration.setName("securityHeadersFilter");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);

        return registration;
    }
}

