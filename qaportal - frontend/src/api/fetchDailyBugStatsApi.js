// src/api/fetchDailyBugStatsApi.js

import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/bugStats";

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

export async function fetchDailyBugStats({
  token,
  authToken,
  organization,
  project,
  startDate,
  endDate,
  tagName,
  signal,
}) {
  if (!organization || !project || !startDate || !endDate || !tagName) {
    throw new Error(
      "organization, project, startDate, endDate, and tagName are required"
    );
  }

  const backendApiToken = await resolveBackendApiToken(
    token || authToken,
    "bug-stats"
  );

  const params = new URLSearchParams();
  params.append("organization", organization);
  params.append("project", project);
  params.append("startDate", startDate);
  params.append("endDate", endDate);
  params.append("tagName", String(tagName).trim());

  const url = `${BASE}${ENDPOINT}?${params.toString()}`;

  async function requestWithToken(activeToken, retried = false) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${activeToken}`,
      },
      signal,
    });

    if (res.status === 401) {
      const errorText = await readErrorBody(res);
      if (!retried) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }
      }
      throw createUnauthorizedSessionError(errorText, "bug-stats");
    }

    if (res.status === 403) {
      const errorText = await readErrorBody(res);
      const error = new Error(`Forbidden: ${errorText}`);
      error.status = 403;
      throw error;
    }

    if (!res.ok) {
      const errorText = await readErrorBody(res);
      if (!retried && isUnauthorizedPayloadMessage(errorText)) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }
        throw createUnauthorizedSessionError(errorText, "bug-stats");
      }
      const error = new Error(
        `DailyBugStats API Error ${res.status}: ${errorText}`
      );
      error.status = res.status;
      throw error;
    }

    const payload = await res.json();

    return {
      ...payload,
      value: Array.isArray(payload?.value) ? payload.value : [],
    };
  }

  return requestWithToken(backendApiToken);
}
