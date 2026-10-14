package com.nathcorp.QAPortal.service;

import jakarta.annotation.PostConstruct;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class ProfileLogger {

    private final Environment env;

    public ProfileLogger(Environment env) {
        this.env = env;
    }

    @PostConstruct
    public void logProfile() {
    }
}