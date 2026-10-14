package com.nathcorp.QAPortal;

import com.azure.spring.data.cosmos.repository.config.EnableCosmosRepositories;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableAsync
@EnableCaching
@EnableScheduling
@SpringBootApplication
//@EnableCosmosRepositories(basePackages = "com.nathcorp.QAPortal.repository")
public class QaPortalApplication {

	public static void main(String[] args) {
		SpringApplication.run(QaPortalApplication.class, args);
	}

}