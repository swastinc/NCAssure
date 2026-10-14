Build and run both the React frontend and Spring Boot backend in one container
from the repository root. Docker builds both applications; no local Node or Maven
installation is needed. Spring Boot serves the React files and `/api/*` on port
8080.

PowerShell build example (replace the Azure placeholders):

```powershell
docker build -t ncassure `
  --build-arg VITE_API_BASE_URL="https://ncqaportal.azurewebsites.net" `
  --build-arg VITE_AZUREAD_CLIENT_ID="<frontend-app-client-id>" `
  --build-arg VITE_AZUREAD_TENANT_ID="<tenant-id>" `
  --build-arg VITE_BACKEND_API_SCOPE="api://<backend-app-client-id>/access_as_user" `
  --build-arg VITE_ORGANIZATION="<azure-devops-organization>" `
  .
```

The image includes `docker/application-staging.properties`, which maps the
backend environment variables and contains no credentials. Supply the backend
settings at runtime, for example using a local environment file:

```powershell
docker run --rm --name ncassure -p 8080:8080 --env-file .env.local ncassure
```

The environment file must include the Azure AI Search key, Azure OpenAI endpoint,
key and deployment names, `AZUREAD_CLIENT_ID`, `AZUREAD_CLIENT_SECRET`,
`AZUREAD_TENANT_ID`, `AZURE_AD_GROUP_ID`, `AZURE_DEVOPS_WEBHOOK_URL`, and
`QAPORTAL_WEBHOOK_SECRET`. Cosmos accepts either the existing `AZURE_COSMOS_*`
aliases or `SPRING_CLOUD_AZURE_COSMOS_ENDPOINT`, `SPRING_CLOUD_AZURE_COSMOS_KEY`,
and `SPRING_CLOUD_AZURE_COSMOS_DATABASE` directly.

To override the bundled defaults, mount your existing staging file read-only:

```powershell
docker run --rm --name ncassure -p 8080:8080 `
  --mount "type=bind,source=$((Get-Location).Path)/src/main/resources/application-staging.properties,target=/app/config/application-staging.properties,readonly" `
  ncassure
```

Open http://localhost:8080. Register
`http://localhost:8080/auth/callback` as a SPA redirect URI in your Azure app
registration. Backend configuration can also be supplied using `--env-file`
with Spring-compatible environment variable names. Local `.env` files and
backend dev/local/staging property files are excluded from the image.

For deployment, build with `--build-arg VITE_API_BASE_URL=https://your-host`
(the public origin, without `/api` or a trailing slash), and run with
`-e CORS_ALLOWED_ORIGINS=https://your-host`. Vite settings are embedded at build
time: rebuild the image to change them. Never pass client secrets as Vite
arguments. `VITE_AZUREAD_REDIRECT_PATH`, `VITE_ADMIN_NAME`, and `VITE_ADMIN_EMAIL`
are also available as optional build arguments.

The default backend profile is `staging`; override it with
`-e SPRING_PROFILES_ACTIVE=your-profile` and mount the corresponding configuration
under `/app/config`. On Azure App Service, supply the backend environment
variables as app settings and route container traffic to port 8080 (using
`WEBSITES_PORT=8080` for classic custom containers, or target port 8080 for
sidecar-enabled hosting). Rebuild and redeploy after changing the bundled
configuration. Java serves the frontend and API on port 8080. Direct visits
and refreshes of `/`, `/login`, `/home`, and `/auth/callback` load the React app.
The entrypoint runs Java as the container's main process so Docker shutdown
signals reach it directly.
