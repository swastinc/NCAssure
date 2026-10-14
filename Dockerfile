
# ==========================================
# STAGE 1: BUILD REACT FRONTEND
# ==========================================

FROM node:22-alpine AS frontend-build

WORKDIR /build/frontend

COPY ["qaportal - frontend/package.json", "qaportal - frontend/package-lock.json", "./"]

RUN npm ci --no-audit --no-fund

COPY ["qaportal - frontend/", "./"]

# Production API uses the same origin as the UI.
ARG VITE_API_BASE_URL=https://ncqaportal.azurewebsites.net
ARG VITE_AZUREAD_CLIENT_ID
ARG VITE_AZUREAD_TENANT_ID
ARG VITE_BACKEND_API_SCOPE
ARG VITE_AZUREAD_REDIRECT_PATH=/auth/callback
ARG VITE_ORGANIZATION=NC-QA
ARG VITE_ADMIN_NAME=Admin
ARG VITE_ADMIN_EMAIL=""

RUN test -n "$VITE_AZUREAD_CLIENT_ID" \
    && test -n "$VITE_AZUREAD_TENANT_ID" \
    && test -n "$VITE_BACKEND_API_SCOPE" \
    && npm run build


# ==========================================
# STAGE 2: BUILD SPRING BOOT BACKEND
# ==========================================

FROM maven:3.9-eclipse-temurin-17 AS backend-build

WORKDIR /build/backend

COPY pom.xml ./
COPY src ./src

# React production build served by Spring Boot
COPY --from=frontend-build \
    /build/frontend/dist/ \
    /build/backend/src/main/resources/static/

RUN mvn -B -ntp -DskipTests package


# ==========================================
# STAGE 3: PRODUCTION CONTAINER
# ==========================================

FROM eclipse-temurin:17-jre-jammy AS runtime

WORKDIR /app

COPY --from=backend-build \
    /build/backend/target/QAPortal-0.0.1-SNAPSHOT.jar \
    /app/app.jar

COPY files/UserManual.docx /app/files/UserManual.docx

COPY docker/start.sh /app/start.sh

COPY docker/application-staging.properties \
    /app/config/application-staging.properties

RUN chmod +x /app/start.sh

ENV JAVA_OPTS="-XX:MaxRAMPercentage=65.0 -Djava.security.egd=file:/dev/./urandom" \
    SPRING_PROFILES_ACTIVE=staging \
    SPRING_CONFIG_ADDITIONAL_LOCATION=optional:file:/app/config/ \
    SERVER_PORT=8080 \
    CORS_ALLOWED_ORIGINS=https://ncqaportal.azurewebsites.net

EXPOSE 8080

ENTRYPOINT ["/bin/bash", "/app/start.sh"]
