// src/api/teamsApi.js
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE = import.meta.env.VITE_API_BASE_URL;

async function readText(response) {
  return response.text().catch(() => "");
}

async function apiRequest(path, init = {}, token, retried = false) {
  const backendToken = await resolveBackendApiToken(token, "teams");
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendToken}`,
      ...(init.headers || {}),
    },
  });

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await readText(res);

  const message =
    (payload && payload.message) ||
    (typeof payload === "string" && payload) ||
    `Request failed (${res.status})`;

  if (res.status === 401) {
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return apiRequest(path, init, freshToken, true);
      }
    }

    throw createUnauthorizedSessionError(message, "teams");
  }

  if (!res.ok) {
    if (!retried && isUnauthorizedPayloadMessage(message)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return apiRequest(path, init, freshToken, true);
      }

      throw createUnauthorizedSessionError(message, "teams");
    }

    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return payload;
}

export async function sendTeamsMessage({
  teamId,
  channelId,
  projectId,
  remarks,
  token,
  authToken,
}) {
  return apiRequest(
    "/api/teams/sendMessage",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain",
      },
      body: new URLSearchParams({ teamId, channelId, projectId, remarks }).toString(),
    },
    token || authToken
  );
}

export async function sendSignOffTeamsMessage({
  teamId,
  channelId,
  project,
  version,
  completedBy,
  dateChanged,
  signOffPdfLink,
  remarks,
  token,
  authToken,
}) {
  return apiRequest(
    "/api/teams/sendSignOffMessage",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain",
      },
      body: new URLSearchParams({
        teamId,
        channelId,
        project,
        version,
        completedBy,
        dateChanged,
        signOffPdfLink,
        remarks,
      }).toString(),
    },
    token || authToken
  );
}

export async function getAllTeamsWithChannels(opts = {}) {
  return apiRequest("/api/teams/allchannels", { method: "GET" }, opts.token || opts.authToken);
}
