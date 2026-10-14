package com.nathcorp.QAPortal.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class CosmosRuntimeLogger {
  private static final Logger log = LoggerFactory.getLogger(CosmosRuntimeLogger.class);
  private final Environment env;

  public CosmosRuntimeLogger(Environment env) { this.env = env; }

  @PostConstruct
  public void print() {
    log.info("ACTIVE_PROFILES={}", java.util.Arrays.toString(env.getActiveProfiles()));
    log.info("COSMOS_ENDPOINT={}", env.getProperty("spring.cloud.azure.cosmos.endpoint"));
    log.info("COSMOS_DB={}", env.getProperty("spring.cloud.azure.cosmos.database"));
  }
}
