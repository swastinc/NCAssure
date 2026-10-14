package com.nathcorp.QAPortal;

import com.nathcorp.QAPortal.repository.ActivityLogRepository;
import com.nathcorp.QAPortal.repository.BuildHistoryRepository;
import com.nathcorp.QAPortal.repository.CentralRepoRepository;
import com.nathcorp.QAPortal.repository.KnowledgeBaseRepository;
import com.nathcorp.QAPortal.repository.NotificationRepository;
import com.nathcorp.QAPortal.repository.SignoffRepository;
import com.nathcorp.QAPortal.repository.TestingStatsRepository;
import com.nathcorp.QAPortal.repository.UserRepository;
import com.nathcorp.QAPortal.service.ChatAgentService;
import com.nathcorp.QAPortal.service.FetchProjectService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties = {
		"spring.ai.azure.openai.endpoint=http://localhost",
		"spring.ai.azure.openai.api-key=test",
		"spring.ai.azure.openai.chat.options.deployment-name=test",
		"spring.ai.azure.openai.embedding.options.deployment-name=test",
		"spring.ai.vectorstore.type=azure",
		"spring.ai.vectorstore.azure.url=http://localhost",
		"spring.ai.vectorstore.azure.api-key=test",
		"spring.ai.vectorstore.azure.index-name=test",
		"azuread.client-id=test-client-id",
		"azuread.client-secret=test-client-secret",
		"azuread.tenant-id=test-tenant-id",
		"azure.ad.group-id=test-group-id",
		"ado.org=test-org"
})
@ActiveProfiles("test")
class QaPortalApplicationTests {

	@MockBean(name = "chatClient")
	private ChatClient chatClient;

	@MockBean(name = "bugClassifierClient")
	private ChatClient bugClassifierClient;

	@MockBean
	private EmbeddingModel embeddingModel;

	@MockBean
	private VectorStore vectorStore;

	@MockBean
	private ChatAgentService chatAgentService;

	@MockBean
	private FetchProjectService fetchProjectService;

	@MockBean
	private ActivityLogRepository activityLogRepository;

	@MockBean
	private BuildHistoryRepository buildHistoryRepository;

	@MockBean
	private CentralRepoRepository centralRepoRepository;

	@MockBean
	private KnowledgeBaseRepository knowledgeBaseRepository;

	@MockBean
	private NotificationRepository notificationRepository;

	@MockBean
	private SignoffRepository signoffRepository;

	@MockBean
	private TestingStatsRepository testingStatsRepository;

	@MockBean
	private UserRepository userRepository;

	@Test
	void contextLoads() {
	}

}
