package com.nathcorp.QAPortal.service;

import com.nathcorp.QAPortal.dto.User;
import com.nathcorp.QAPortal.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.stream.StreamSupport;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // Save new user
    public User saveUser(User user) {
        return userRepository.save(user);
    }

    // Optional: Get all users
    public List<User> getAllUsers() {
        Iterable<User> it = userRepository.findAll();
        return StreamSupport.stream(it.spliterator(), false).toList(); // Java 16+
    }

    // Optional: Get user by email
    public User getUserByEmail(String email) {
        return userRepository.findByEmail(email).orElse(null);
    }
    // UserService.java
    public List<User> getUsersByRoles(String... roles) {
        return userRepository.findByRoleIn(java.util.Arrays.asList(roles));
    }

    public User updateUserRole(String email, String newRole) {

        User user = userRepository.findByEmail(email).orElse(null);

        if (user == null) {
            throw new RuntimeException("User not found for email: " + email);
        }

        user.setRole(newRole);
        return userRepository.save(user);
    }

}
