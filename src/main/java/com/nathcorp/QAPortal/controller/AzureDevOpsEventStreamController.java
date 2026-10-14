package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.service.AzureDevOpsWebhookEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.OffsetDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/webhooks/azure-devops")
public class AzureDevOpsEventStreamController {

    private final AzureDevOpsWebhookEventPublisher eventPublisher;

    public AzureDevOpsEventStreamController(
            AzureDevOpsWebhookEventPublisher eventPublisher
    ) {
        this.eventPublisher = eventPublisher;
    }

    @GetMapping(
            value = "/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter streamAzureDevOpsEvents() {
        return eventPublisher.subscribe();
    }

    @GetMapping("/stream/health")
    public Map<String, Object> streamHealth() {
        return Map.of(
                "status", "running",
                "message", "Azure DevOps SSE stream is active",
                "activeSubscribers", eventPublisher.getActiveSubscriberCount(),
                "time", OffsetDateTime.now().toString()
        );
    }
}