package com.nathcorp.QAPortal.service;

public interface IngestionStateStore {
    boolean isUpToDate(String key, String lastModified);
    void markUpToDate(String key, String lastModified);
}
