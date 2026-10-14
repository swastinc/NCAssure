// src/api/fetchTestProgress.js

import {
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";
import { createUnauthorizedError } from "../config/unauthorizedSession";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function normalizeSignal(input) {
  if (!input) return undefined;

  if (
    typeof input === "object" &&
    input !== null &&
    "aborted" in input &&
    typeof input.addEventListener === "function"
  ) {
    return input;
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "signal" in input &&
    input.signal &&
    "aborted" in input.signal
  ) {
    return input.signal;
  }

  return undefined;
}

function createNonBlockingUnauthorizedError(message) {
  const error = createUnauthorizedError(
    message || "Unauthorized. Please sign in again."
  );
  error.nonBlocking = true;
  error.source = "test-progress";
  return error;
}

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

function normalizeTagValue(tagValue) {
  const normalized = String(tagValue ?? "").trim();

  if (
    !normalized ||
    normalized === "__NO_BUILDS__" ||
    normalized === "No Builds Available" ||
    normalized.toLowerCase() === "null" ||
    normalized.toLowerCase() === "undefined"
  ) {
    return "";
  }

  return normalized;
}

function buildProgressUrl(base, organization, project, tagValue, buildName) {
  let safeBase = typeof base === "string" ? base.trim() : "";

  if (!safeBase) {
    safeBase = `${BASE_URL}/api/testProgress`;
  }

  let url;

  try {
    url = new URL(safeBase);
  } catch {
    const fallbackOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";

    url = new URL(safeBase, fallbackOrigin);
  }

  url.searchParams.set("organization", organization);
  url.searchParams.set("project", project);

  const normalizedTag = normalizeTagValue(tagValue);

  if (normalizedTag) {
    url.searchParams.set("tag", normalizedTag);
  }

  url.searchParams.set("buildName", buildName);

  return url.toString();
}

async function fetchJsonWithAuth(url, token, signal, retried = false) {
  const backendApiToken = await resolveBackendApiToken(token, "test-progress");

  const init = {
    method: "GET",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${backendApiToken}`,
      Accept: "application/json",
    },
  };

  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(url, init).catch((err) => {
    throw new Error(`Network error when fetching ${url}: ${err.message || err}`);
  });

  if (response.status === 401) {
    const text = await readErrorBody(response);
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return fetchJsonWithAuth(url, freshToken, signal, true);
      }
    }
    throw createNonBlockingUnauthorizedError(text);
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
      throw createNonBlockingUnauthorizedError(text);
    }
    const error = new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchTestProgress(
  api = `${BASE_URL}/api/testProgress`,
  organization,
  project,
  token,
  tag = null,
  buildName = "",
  signal = undefined
) {
  if (!organization || !String(organization).trim()) {
    throw new Error("organization is required");
  }

  if (!project || !String(project).trim()) {
    throw new Error("project is required");
  }

  const normalizedTag = normalizeTagValue(tag);

  if (!normalizedTag) {
    throw new Error("tagName is required");
  }

  if (!buildName || !String(buildName).trim()) {
    throw new Error("buildName is required");
  }

  const usedSignal = normalizeSignal(signal);

  if (signal !== undefined && !usedSignal) {
    throw new Error(
      "Invalid `signal` argument passed to fetchTestProgress â€” expected AbortSignal or AbortController"
    );
  }

  const url = buildProgressUrl(
    api,
    String(organization).trim(),
    String(project).trim(),
    normalizedTag,
    String(buildName).trim()
  );

  const rawData = await fetchJsonWithAuth(url, token, usedSignal);

  let base = Array.isArray(rawData) ? rawData[0] : rawData;

  if (base && typeof base === "object") {
    base = base.data ?? base.result ?? base;
  }

  const smoke = Math.round(Number(base?.smokeProgress ?? 0));
  const regression = Math.round(Number(base?.regressionProgress ?? 0));
  const performance = Math.round(Number(base?.performanceProgress ?? 0));
  const security = Math.round(Number(base?.securityProgress ?? 0));

  return [
    { id: 1, name: "Smoke Test", percent: smoke },
    { id: 2, name: "Regression Test", percent: regression },
    { id: 3, name: "Performance Test", percent: performance },
    { id: 4, name: "Security Test", percent: security },
  ];
}

export async function updateTestStatus({
  projectId,
  testingStatus,
  token,
  authToken,
  signal,
}) {
  if (!projectId || !String(projectId).trim()) {
    throw new Error("projectId is required");
  }

  if (!testingStatus || !String(testingStatus).trim()) {
    throw new Error("testingStatus is required");
  }

  const initialToken = await resolveBackendApiToken(
    token || authToken,
    "test-progress"
  );

  const url = new URL(`${BASE_URL}/api/builds/update-test-status`);
  url.searchParams.set("projectId", String(projectId).trim());
  url.searchParams.set("testingStatus", String(testingStatus).trim());

  async function requestWithToken(activeToken, retried = false) {
    const response = await fetch(url.toString(), {
      method: "PUT",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${activeToken}`,
        Accept: "application/json",
      },
      signal,
    });

    if (response.status === 401) {
      const text = await readErrorBody(response);
      if (!retried) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }
      }
      throw createNonBlockingUnauthorizedError(text);
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
          return requestWithToken(freshToken, true);
        }
        throw createNonBlockingUnauthorizedError(text);
      }
      const error = new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  return requestWithToken(initialToken);
}
