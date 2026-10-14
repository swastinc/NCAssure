package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.Entity.Notification;
import com.nathcorp.QAPortal.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class NotificationService {

    @Autowired
    private NotificationRepository notificationRepository;

    public Notification createNotification(Notification notification) {
        if (notification.getId() == null || notification.getId().isEmpty()) {
            notification.setId(UUID.randomUUID().toString());
        }
        if (notification.getCreatedAt() == null || notification.getCreatedAt().isEmpty()) {
            notification.setCreatedAt(Instant.now().toString());
        }
        if (notification.getIsRead() == null) {
            notification.setIsRead(false);
        }
        return notificationRepository.save(notification);
    }

    public List<Notification> getNotificationsByUserId(String userId) {
        List<Notification> notifications = notificationRepository.findByUserId(userId);

        if (notifications == null || notifications.isEmpty()) {
            return Collections.emptyList();
        }

        return notifications.stream()
                .sorted(Comparator.comparing(Notification::getCreatedAt).reversed())
                .toList();
    }

    public List<Notification> getUnreadNotificationsByUserId(String userId) {
        return notificationRepository.findByUserIdAndIsRead(userId, false);
    }

    public Notification markAsRead(String id) {
        Notification notification = notificationRepository.findById(id).orElse(null);
        if (notification != null) {
            notification.setIsRead(true);
            return notificationRepository.save(notification);
        }
        return null;
    }
    public void deleteNotification(String id) {
        if (id == null || id.isBlank() || !notificationRepository.existsById(id)) {
            return;
        }

        try {
            notificationRepository.deleteById(id);
        } catch (RuntimeException ex) {
            if (!isNotFoundError(ex)) {
                throw ex;
            }
        }
    }

    private boolean isNotFoundError(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && message.contains("Resource Not Found")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
