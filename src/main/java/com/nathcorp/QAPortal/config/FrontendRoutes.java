package com.nathcorp.QAPortal.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Serves the React entry point on direct visits and browser refreshes. */
@Configuration
public class FrontendRoutes implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        for (String route : new String[] { "/", "/login", "/home", "/auth/callback" }) {
            registry.addViewController(route).setViewName("forward:/index.html");
        }
    }
}
