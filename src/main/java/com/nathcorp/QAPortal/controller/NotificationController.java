package com.nathcorp.QAPortal.controller;

import com.nathcorp.QAPortal.Entity.Notification;
import com.nathcorp.QAPortal.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    @PostMapping
    public ResponseEntity<Notification> createNotification(
            @RequestBody Notification notification
    ) {

        Notification created =
                notificationService.createNotification(notification);

        return ResponseEntity.ok(created);
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<Notification>> getNotificationsByUserId(
            @PathVariable String userId
    ) {

        List<Notification> notifications =
                notificationService.getNotificationsByUserId(userId);

        return ResponseEntity.ok(notifications);
    }

    @GetMapping("/user/{userId}/unread")
    public ResponseEntity<List<Notification>> getUnreadNotificationsByUserId(
            @PathVariable String userId
    ) {

        List<Notification> notifications =
                notificationService.getUnreadNotificationsByUserId(userId);

        return ResponseEntity.ok(notifications);
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<Notification> markAsRead(
            @PathVariable String id
    ) {

        Notification updated =
                notificationService.markAsRead(id);

        if (updated != null) {
            return ResponseEntity.ok(updated);
        }

        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNotification(
            @PathVariable String id
    ) {

        notificationService.deleteNotification(id);

        return ResponseEntity.noContent().build();
    }
}