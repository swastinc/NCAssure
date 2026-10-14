package com.nathcorp.QAPortal.dto;

import com.azure.spring.data.cosmos.core.mapping.Container;
import com.azure.spring.data.cosmos.core.mapping.PartitionKey;
import org.springframework.data.annotation.Id;

import java.time.OffsetDateTime;
import java.util.UUID;

@Container(containerName = "KnowledgeBase")
public class KnowledgeBaseItem {

        @Id
        @PartitionKey
        private String id;


        private String title;
        private String link;
        private String description;
        private OffsetDateTime createdDate;

        public KnowledgeBaseItem() {
            this.id = UUID.randomUUID().toString();
            this.createdDate = OffsetDateTime.now();
        }



    // Getters & Setters

    public String getId() {
        return id;
    }



    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLink() {
        return link;
    }

    public void setLink(String link) {
        this.link = link;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public OffsetDateTime getCreatedDate() {
        return createdDate;
    }

    public void setId(String id) { this.id =id;
    }
}
