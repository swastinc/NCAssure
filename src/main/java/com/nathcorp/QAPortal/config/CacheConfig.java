package com.nathcorp.QAPortal.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

@Configuration
public class CacheConfig{

    @Bean
    public Caffeine<Object, Object> caffeineConfig() {
        return Caffeine.newBuilder()
                .expireAfterWrite(30, TimeUnit.SECONDS) // TTL
                .maximumSize(100);
    }

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager =
                new CaffeineCacheManager("executionSummary");

        cacheManager.setCaffeine(caffeineConfig());
        return cacheManager;
    }
}