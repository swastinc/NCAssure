package com.nathcorp.QAPortal.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
public class SessionContext {

    public String getSessionId() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (!(attrs instanceof ServletRequestAttributes servletAttrs)) {
            throw new IllegalStateException("No active request context");
        }

        HttpServletRequest request = servletAttrs.getRequest();
        HttpSession session = request.getSession(false);

        if (session == null) {
            throw new IllegalStateException("No active session");
        }

        return session.getId();
    }
}