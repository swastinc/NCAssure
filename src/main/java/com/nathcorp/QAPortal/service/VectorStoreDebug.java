package com.nathcorp.QAPortal.service;

import jakarta.annotation.PostConstruct;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Component;

@Component
public class VectorStoreDebug {

  private final VectorStore vectorStore;

  public VectorStoreDebug(VectorStore vectorStore) {
    this.vectorStore = vectorStore;
  }

  @PostConstruct
  public void log() {
  }
}
