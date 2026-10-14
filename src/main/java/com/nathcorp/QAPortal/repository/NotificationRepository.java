package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import com.azure.spring.data.cosmos.repository.Query;
import com.nathcorp.QAPortal.Entity.Notification;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends CosmosRepository<Notification, String> {
    List<Notification> findByUserId(String userId);
    List<Notification> findByUserIdAndIsRead(String userId, Boolean isRead);
}
