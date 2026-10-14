package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.Entity.ActivityLog;
import com.nathcorp.QAPortal.repository.ActivityLogRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ActivityLogService {

    private final ActivityLogRepository logRepo;

    public ActivityLogService(ActivityLogRepository logRepo) {
        this.logRepo = logRepo;
    }

    public void log(String actionType, String username, String details) {
        ActivityLog log = new ActivityLog(actionType, username, details);
        logRepo.save(log);
    }

    public List<ActivityLog> getAllLogs() {
        return logRepo.getAllLogs();
    }
}
