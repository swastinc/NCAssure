import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const TASKS_API_DEFAULT = `${BASE_URL}/api/tasks`;

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

async function fetchJsonWithAuth(url, token, signal, retried = false) {
  const backendApiToken = await resolveBackendApiToken(token, "tasks");

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendApiToken}`,
    },
    signal,
  });

  if (response.status === 401) {
    const text = await readErrorBody(response);

    if (!retried) {
      const freshToken = await getFreshBackendApiToken();

      if (freshToken) {
        return fetchJsonWithAuth(url, freshToken, signal, true);
      }
    }

    throw createUnauthorizedSessionError(text, "tasks");
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
        return fetchJsonWithAuth(url, freshToken, signal, true);
      }

      throw createUnauthorizedSessionError(text, "tasks");
    }

    const error = new Error(
      `HTTP ${response.status} when calling /api/tasks: ${text}`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchTasks(
  api = TASKS_API_DEFAULT,
  organization,
  project,
  buildName,
  tagName,
  token,
  signal = undefined
) {
  if (!organization || !project) {
    throw new Error("organization and project are required");
  }

  const url = new URL(api);

  const safeBuildName = String(buildName || "").trim();
  const safeTagName = String(tagName || "").trim();

  url.searchParams.set("organization", organization);
  url.searchParams.set("project", project);

  if (safeTagName) {
    url.searchParams.set("tagName", safeTagName);
  }

  if (safeBuildName) {
    url.searchParams.set("buildName", safeBuildName);
  }

  return fetchJsonWithAuth(url, token, signal);
}
