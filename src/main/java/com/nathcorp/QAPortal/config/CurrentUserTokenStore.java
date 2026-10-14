package com.nathcorp.QAPortal.config;

import com.nathcorp.QAPortal.components.UserTokenStore;
import org.springframework.stereotype.Component;

@Component
public class CurrentUserTokenStore {

    private final UserTokenStore userTokenStore;
    private final SessionContext sessionContext;

    public CurrentUserTokenStore(UserTokenStore userTokenStore, SessionContext sessionContext) {
        this.userTokenStore = userTokenStore;
        this.sessionContext = sessionContext;
    }

    public void saveAdoToken(String token) {
        userTokenStore.saveAdoToken(sessionContext.getSessionId(), token);
    }

    public String getAdoToken() {
        return userTokenStore.getAdoToken(sessionContext.getSessionId());
    }

    public void saveGraphToken(String token) {
        userTokenStore.saveGraphToken(sessionContext.getSessionId(), token);
    }

    public String getGraphToken() {
        return userTokenStore.getGraphToken(sessionContext.getSessionId());
    }

    public void setUserEmail(String email) {
        userTokenStore.setUserEmail(sessionContext.getSessionId(), email);
    }

    public String getUserEmail() {
        return userTokenStore.getUserEmail(sessionContext.getSessionId());
    }

    public void setUserName(String name) {
        userTokenStore.setUserName(sessionContext.getSessionId(), name);
    }

    public String getUserName() {
        return userTokenStore.getUserName(sessionContext.getSessionId());
    }

    public void clearSession() {
        userTokenStore.clearSession(sessionContext.getSessionId());
    }
}