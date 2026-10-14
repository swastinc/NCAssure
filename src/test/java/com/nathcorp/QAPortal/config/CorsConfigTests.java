package com.nathcorp.QAPortal.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.ResourcePropertySource;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class CorsConfigTests {
    private List<String> defaultOrigins() throws Exception {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(
                new ResourcePropertySource(new ClassPathResource("application.properties")));
        String origins = environment.resolveRequiredPlaceholders(
                environment.getRequiredProperty("app.cors.allowed-origins"));
        return Arrays.asList(origins.split(","));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://ncqaportal.azurewebsites.net",
            "http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:4173", "http://127.0.0.1:4173"
    })
    void allowsFrontendPreflightWithAuthHeaders(String origin) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/projects");
        request.addHeader("Origin", origin);
        request.addHeader("Access-Control-Request-Method", "POST");
        request.addHeader("Access-Control-Request-Headers", "authorization,content-type");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean downstreamCalled = new AtomicBoolean();

        new CorsConfig().corsFilter(defaultOrigins()).getFilter().doFilter(
                request, response, (req, res) -> downstreamCalled.set(true));

        assertEquals(200, response.getStatus());
        assertEquals(origin, response.getHeader("Access-Control-Allow-Origin"));
        assertEquals("true", response.getHeader("Access-Control-Allow-Credentials"));
        assertTrue(response.getHeader("Access-Control-Allow-Headers").contains("authorization"));
        assertFalse(downstreamCalled.get(), "Preflight must finish before application authentication");
    }

    @Test
    void rejectsUnlistedOrigin() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/projects");
        request.addHeader("Origin", "https://untrusted.example");
        request.addHeader("Access-Control-Request-Method", "GET");
        MockHttpServletResponse response = new MockHttpServletResponse();

        new CorsConfig().corsFilter(defaultOrigins()).getFilter().doFilter(
                request, response, (req, res) -> fail("Unlisted origin must be blocked"));

        assertEquals(403, response.getStatus());
        assertNull(response.getHeader("Access-Control-Allow-Origin"));
    }

    @Test
    void configurableOriginReachesApplicationWithCorsHeaders() throws Exception {
        String origin = "http://localhost:5174";
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/projects");
        request.addHeader("Origin", origin);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean downstreamCalled = new AtomicBoolean();

        new CorsConfig().corsFilter(List.of(origin)).getFilter().doFilter(
                request, response, (req, res) -> downstreamCalled.set(true));

        assertTrue(downstreamCalled.get());
        assertEquals(origin, response.getHeader("Access-Control-Allow-Origin"));
    }
}
