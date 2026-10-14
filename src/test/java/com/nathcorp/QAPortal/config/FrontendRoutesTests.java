package com.nathcorp.QAPortal.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(FrontendRoutes.class)
class FrontendRoutesTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void servesReactRoutesOnDirectRequest() throws Exception {
        for (String route : new String[] { "/", "/login", "/home", "/auth/callback" }) {
            mockMvc.perform(get(route))
                    .andExpect(status().isOk())
                    .andExpect(forwardedUrl("/index.html"));
        }
    }

    @Test
    void doesNotForwardUnknownApiRoutesToReact() throws Exception {
        mockMvc.perform(get("/api/missing"))
                .andExpect(forwardedUrl(null));
    }
}
