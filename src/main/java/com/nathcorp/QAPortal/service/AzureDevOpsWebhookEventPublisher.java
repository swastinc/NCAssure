package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.BuildDto;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class AzureDevOpsWebhookEventPublisher {

    public static final String RECENT_RELEASE_EVENT_KEY =
            "recent-build-release";

    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);

        emitters.add(emitter);

        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));

        try {
            Map<String, Object> connectedEvent = new LinkedHashMap<>();
            connectedEvent.put("type", "connected");
            connectedEvent.put("message", "Connected to Azure DevOps webhook event stream");
            connectedEvent.put("time", OffsetDateTime.now().toString());
    
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data(connectedEvent));
        } catch (IOException | IllegalStateException ex) {
            emitters.remove(emitter);
        }

        return emitter;
    }

    public void publishAzureDevOpsEvent(Map<String, Object> event) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name("azure-devops-workitem")
                        .data(event));
            } catch (IOException | IllegalStateException ex) {
                emitters.remove(emitter);
            }
        }
    }

    public void publishRecentReleaseEvent(BuildDto builds) {


        String eventId = UUID.randomUUID().toString();
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventKey", RECENT_RELEASE_EVENT_KEY);
        event.put("eventId", eventId);
        event.put("type", "recent-release");
        event.put("message", "Recently released builds are available");
        event.put("builds", builds);
        event.put("time", OffsetDateTime.now().toString());

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .id(eventId)
                        .name(RECENT_RELEASE_EVENT_KEY)
                        .data(event));
            } catch (IOException | IllegalStateException ex) {
                emitters.remove(emitter);
            }
        }
    }

    public int getActiveSubscriberCount() {
        return emitters.size();
    }
}
