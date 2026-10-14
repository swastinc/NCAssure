// src/api/recentActivityApi.js
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const ENDPOINT = "/api/recent-activity";

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

async function requestJson(
  url,
  { token, authToken, signal, headers = {}, ...init } = {},
  retried = false
) {
  const backendApiToken = await resolveBackendApiToken(
    token || authToken,
    "recent-activity"
  );

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendApiToken}`,
      ...headers,
    },
    signal,
    ...init,
  });

  if (response.status === 401) {
    const text = await readErrorBody(response);
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return requestJson(
          url,
          { ...init, headers, signal, token: freshToken },
          true
        );
      }
    }

    throw createUnauthorizedSessionError(text, "recent-activity");
  }

  if (response.status === 403) {
    const text = await readErrorBody(response);
    const error = new Error(`Forbidden: ${text}`);
    error.status = 403;
    throw error;
  }

  if (!response.ok) {
    const text = await readErrorBody(response);
    if (!retried && isUnauthorizedPayloadMessage(text)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return requestJson(
          url,
          { ...init, headers, signal, token: freshToken },
          true
        );
      }

      throw createUnauthorizedSessionError(text, "recent-activity");
    }

    const error = new Error(text || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchRecentBugs({
  token,
  authToken,
  organization,
  project,
  baseUrl = BASE_URL,
  signal,
} = {}) {
  if (!organization) throw new Error("organization is required");
  if (!project) throw new Error("project is required");

  const qs = new URLSearchParams({
    organization,
    project,
  });

  const url = `${baseUrl}${ENDPOINT}/bugs?${qs.toString()}`;

  return requestJson(url, {
    method: "GET",
    token: token || authToken,
    signal,
  });
}
