package com.nathcorp.QAPortal.repository;

import com.azure.spring.data.cosmos.repository.CosmosRepository;
import com.nathcorp.QAPortal.dto.User;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends CosmosRepository<User, String> {
    // Optional query method
    Optional<User> findByEmail(String email);
    List<User> findByRoleIn(List<String> roles);

}
