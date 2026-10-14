// src/api/dashboardApi.js
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const ENDPOINT = "/api/dashboard";

async function readText(res) {
  return res.text().catch(() => "");
}

async function fetchWithRetry(url, opts, source, retried = false) {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });

  if (res.status === 401) {
    const text = await readText(res);
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return fetchWithRetry(
          url,
          {
            ...opts,
            headers: {
              ...(opts.headers || {}),
              Authorization: `Bearer ${freshToken}`,
            },
          },
          source,
          true
        );
      }
    }
    throw createUnauthorizedSessionError(
      text || "Unauthorized. Please sign in again.",
      source
    );
  }

  if (!res.ok) {
    const text = await readText(res);
    if (!retried && isUnauthorizedPayloadMessage(text)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return fetchWithRetry(
          url,
          {
            ...opts,
            headers: {
              ...(opts.headers || {}),
              Authorization: `Bearer ${freshToken}`,
            },
          },
          source,
          true
        );
      }
      throw createUnauthorizedSessionError(text, source);
    }
    const error = new Error(text || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }

  return res;
}

export async function fetchDashboardMetrics(
  { organization, project, tagName, buildName },
  opts = {}
) {
  if (!organization) throw new Error("organization is required");
  if (!project) throw new Error("project is required");

  const params = new URLSearchParams({
    organization,
    project,
  });

  const normalizedTagName = String(tagName || "").trim();
  const normalizedBuildName = String(buildName || "").trim();

  if (normalizedTagName) {
    params.append("tagName", normalizedTagName);
  }

  if (normalizedBuildName) {
    params.append("buildName", normalizedBuildName);
  }

  const qs = params.toString();
  const url = `${BASE_URL}${ENDPOINT}/metrics?${qs}`;
  const { token, authToken, headers = {}, ...requestOptions } = opts;
  const resolvedToken = await resolveBackendApiToken(
    token || authToken,
    "dashboard-metrics"
  );

  const res = await fetchWithRetry(
    url,
    {
      ...requestOptions,
      headers: {
        ...headers,
        Authorization: `Bearer ${resolvedToken}`,
      },
    },
    "dashboard-metrics"
  );
  return res.json();
}

export async function fetchDashboardWorkitems(
  { organization, project, tagName, buildName },
  opts = {}
) {
  if (!organization) throw new Error("organization is required");
  if (!project) throw new Error("project is required");

  const normalizedTagName = String(tagName || "").trim();
  const normalizedBuildName = String(buildName || "").trim();

  if (!normalizedTagName) throw new Error("tagName is required");
  if (!normalizedBuildName) throw new Error("buildName is required");

  const qs = new URLSearchParams({
    organization,
    project,
    tagName: normalizedTagName,
    buildName: normalizedBuildName,
  }).toString();
  const url = `${BASE_URL}${ENDPOINT}/workitems?${qs}`;
  const { token, authToken, headers = {}, ...requestOptions } = opts;
  const resolvedToken = await resolveBackendApiToken(
    token || authToken,
    "dashboard-workitems"
  );

  const res = await fetchWithRetry(
    url,
    {
      ...requestOptions,
      headers: {
        ...headers,
        Authorization: `Bearer ${resolvedToken}`,
      },
    },
    "dashboard-workitems"
  );
  const data = await res.json();
  const items = Array.isArray(data?.value) ? data.value : [];

  return items
    .filter((w) => w && w.WorkItemId != null)
    .map((w) => ({
      WorkItemId: w.WorkItemId,
      WorkItemType: w.WorkItemType,
      Title: w.Title,
      State: w.State,
    }));
}
