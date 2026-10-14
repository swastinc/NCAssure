
package com.nathcorp.QAPortal.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

public class SecurityHeadersFilter extends OncePerRequestFilter {

    static final String CONTENT_SECURITY_POLICY =
            "default-src 'none'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; " +
                    "font-src 'self' data:; " +
                    "connect-src 'self' https://login.microsoftonline.com; " +
                    "frame-src 'self' https://login.microsoftonline.com; " +
                    "manifest-src 'self'; " +
                    "frame-ancestors 'none'; " +
                    "object-src 'none'; " +
                    "base-uri 'self'; " +
                    "form-action 'self';";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        response.setHeader(
                "Content-Security-Policy",
                CONTENT_SECURITY_POLICY
        );

        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("X-Content-Type-Options", "nosniff");

        response.setHeader(
                "Referrer-Policy",
                "strict-origin-when-cross-origin"
        );

        filterChain.doFilter(request, response);
    }
}
