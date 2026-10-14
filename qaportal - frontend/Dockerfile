# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# (Optional but common) native build deps for packages like sharp/canvas/bcrypt
RUN apk add --no-cache python3 make g++

# Copy manifests first (cache-friendly)
COPY package*.json ./

# Install deps with fallback:
# - If lock exists: try npm ci
# - If npm ci fails: remove lock and use npm install
RUN set -eux; \
    echo "Node=$(node -v) NPM=$(npm -v)"; \
    ls -la; \
    if [ -f package-lock.json ]; then \
      echo "✅ package-lock.json found -> trying npm ci"; \
      npm ci --no-audit --fund=false \
      || (echo "⚠️ npm ci failed -> removing lockfile and running npm install"; \
          rm -f package-lock.json; \
          npm install --no-audit --fund=false); \
    else \
      echo "⚠️ No package-lock.json -> running npm install"; \
      npm install --no-audit --fund=false; \
    fi

# Copy source
COPY . .

# Choose which env file to bake into build (safe)
ARG ENV_FILE=.env.production
ARG VITE_API_BASE_URL
ARG VITE_AZUREAD_CLIENT_ID
ARG VITE_AZUREAD_TENANT_ID
ARG VITE_AZUREAD_REDIRECT_PATH
ARG VITE_ORGANIZATION
ARG VITE_BACKEND_API_SCOPE
RUN set -eux; \
    if [ -f "$ENV_FILE" ]; then \
      echo "✅ Using env file: $ENV_FILE"; \
      cp "$ENV_FILE" .env; \
    else \
      echo "⚠️ ENV file '$ENV_FILE' not found, continuing"; \
    fi

# Build (Vite outputs to /app/dist)
RUN set -eux; \
    if [ -n "${VITE_API_BASE_URL:-}" ]; then export VITE_API_BASE_URL; fi; \
    if [ -n "${VITE_AZUREAD_CLIENT_ID:-}" ]; then export VITE_AZUREAD_CLIENT_ID; fi; \
    if [ -n "${VITE_AZUREAD_TENANT_ID:-}" ]; then export VITE_AZUREAD_TENANT_ID; fi; \
    if [ -n "${VITE_AZUREAD_REDIRECT_PATH:-}" ]; then export VITE_AZUREAD_REDIRECT_PATH; fi; \
    if [ -n "${VITE_ORGANIZATION:-}" ]; then export VITE_ORGANIZATION; fi; \
    if [ -n "${VITE_BACKEND_API_SCOPE:-}" ]; then export VITE_BACKEND_API_SCOPE; fi; \
    npm run build

# ---------- runtime stage ----------
FROM node:22-alpine
RUN npm install --global serve@14.2.4 --no-audit --no-fund
COPY --from=build /app/dist /app/dist

EXPOSE 80
CMD ["serve", "--single", "/app/dist", "--listen", "80"]
