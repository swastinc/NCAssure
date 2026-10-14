package com.nathcorp.QAPortal.controller;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RootController {

    @GetMapping("/ok")
    public String home() {
        return "QAPortal v2.2 is running ✅";
    }

    @GetMapping("/healthz")
    public String healthz() {
        return "ok";
    }
}
