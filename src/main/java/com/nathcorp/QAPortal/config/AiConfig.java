package com.nathcorp.QAPortal.config;

import org.springframework.ai.chat.client.AdvisorParams;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("!test")
public class AiConfig {

    @Bean
    public ChatMemory chatMemory() {
        // Keep last N messages in memory (in RAM)
        return MessageWindowChatMemory.builder()
                .maxMessages(100)
                .build();
    }

    @Bean
    public ChatClient chatClient(ChatClient.Builder builder, ChatMemory chatMemory) {
        return builder
                .defaultSystem("""
                    You are Alex, a QA DevOps assistant.
                    Use available tools when needed. Be concise.
                    Always take organization as "NC-QA" and never aks for it.
                """)
                // ✅ memory advisor (adds history into prompt as messages)
                .defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())
                .build();
    }



    @Bean
    @Qualifier("bugClassifierClient")
    public ChatClient bugClassifierClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("""
                You are a strict bug classifier.
                Output ONLY valid JSON. No markdown. No extra text.
            """)
                // helps structured output reliability
                .defaultAdvisors(AdvisorParams.ENABLE_NATIVE_STRUCTURED_OUTPUT)
                .build();
    }


}
