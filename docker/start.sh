
#!/bin/bash
set -e

PORT="${SERVER_PORT:-8080}"

echo "Starting QAPortal Spring Boot application"
echo "Spring profile: ${SPRING_PROFILES_ACTIVE:-staging}"
echo "Listening on port: ${PORT}"

exec java ${JAVA_OPTS:-} \
  -jar /app/app.jar \
  --server.port="${PORT}" \
  --server.address=0.0.0.0
