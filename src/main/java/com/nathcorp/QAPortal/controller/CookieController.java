package com.nathcorp.QAPortal.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CookieController {

    @GetMapping("/api/auth/cookie-test")
    public ResponseEntity<String> cookieTest(
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        HttpSession session = request.getSession(true);

        ResponseCookie cookie = ResponseCookie.from("TEST_COOKIE", "hello")
                .httpOnly(true)
                .secure(false)   // local HTTP test
                .sameSite("Lax") // local test
                .path("/")
                .maxAge(3600)
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

        return ResponseEntity.ok("cookie test ok, sessionId=" + session.getId());
    }
}