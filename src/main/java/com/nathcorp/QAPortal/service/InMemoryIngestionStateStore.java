package com.nathcorp.QAPortal.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

@Component
public class InMemoryIngestionStateStore implements IngestionStateStore {

    private final ConcurrentHashMap<String, String> lastModifiedByKey = new ConcurrentHashMap<>();

    @Override
    public boolean isUpToDate(String key, String lastModified) {
        if (key == null) return false;
        String prev = lastModifiedByKey.get(key);
        return prev != null && prev.equals(lastModified == null ? "" : lastModified);
    }

    @Override
    public void markUpToDate(String key, String lastModified) {
        if (key == null) return;
        lastModifiedByKey.put(key, lastModified == null ? "" : lastModified);
    }
}
