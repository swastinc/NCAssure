// src/api/fetchBugSeverity.js

import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/bugs/severity-count";

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

export async function fetchBugSeverity({
  token,
  authToken,
  organization,
  project,
  tagName,
  buildName,
  signal,
}) {
  if (!organization || !project || !tagName || !buildName) {
    throw new Error("organization, project, tagName, and buildName are required");
  }

  const backendApiToken = await resolveBackendApiToken(
    token || authToken,
    "bug-severity"
  );

  const qs = new URLSearchParams({
    organization,
    project,
    tagName,
    buildName,
  }).toString();

  const url = `${BASE_URL}${ENDPOINT}?${qs}`;

  try {
    async function requestWithToken(activeToken, retried = false) {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        signal,
      });

      if (response.status === 401) {
        const errorText = await readErrorBody(response);
        if (!retried) {
          const freshToken = await getFreshBackendApiToken();
          if (freshToken) {
            return requestWithToken(freshToken, true);
          }
        }
        throw createUnauthorizedSessionError(errorText, "bug-severity");
      }

      if (response.status === 403) {
        const errorText = await readErrorBody(response);
        const error = new Error(`Forbidden: ${errorText}`);
        error.status = 403;
        throw error;
      }

      if (!response.ok) {
        const errorText = await readErrorBody(response);
        if (!retried && isUnauthorizedPayloadMessage(errorText)) {
          const freshToken = await getFreshBackendApiToken();
          if (freshToken) {
            return requestWithToken(freshToken, true);
          }
          throw createUnauthorizedSessionError(errorText, "bug-severity");
        }
        const error = new Error(
          `Bug Severity API Error ${response.status}: ${errorText}`
        );
        error.status = response.status;
        throw error;
      }

      return response.json();
    }

    return requestWithToken(backendApiToken);
  } catch (err) {
    if (err.name === "AbortError") {
      return null;
    }

    throw err;
  }
}
