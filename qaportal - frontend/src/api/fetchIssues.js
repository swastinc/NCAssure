// src/api/fetchIssues.js

import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ISSUES_API_DEFAULT = `${BASE_URL}/api/issues`;

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

async function fetchJsonWithAuth(url, token, signal, retried = false) {
  const backendApiToken = await resolveBackendApiToken(token, "issues");

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

    throw createUnauthorizedSessionError(text, "issues");
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

      throw createUnauthorizedSessionError(text, "issues");
    }

    const error = new Error(
      `HTTP ${response.status} when calling /api/issues: ${text}`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function normalizeItems(data) {
  if (Array.isArray(data?.value)) {
    return data.value;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.workItems)) {
    return data.workItems;
  }

  return Array.isArray(data) ? data : [];
}

function getIssueState(item) {
  return (
    item?.State ??
    item?.state ??
    item?.fields?.["System.State"] ??
    ""
  )
    .toString()
    .trim();
}

export async function fetchActiveIssuesList(
  api = ISSUES_API_DEFAULT,
  organization,
  project,
  token,
  tagName,
  signal = undefined,
  buildName = ""
) {
  if (!organization || !project || !String(tagName || "").trim()) {
    throw new Error("organization, project, and tagName are required");
  }

  const url = new URL(api);

  const safeTagName = String(tagName || "").trim();
  const safeBuildName = String(buildName || "").trim();

  url.searchParams.set("organization", organization);
  url.searchParams.set("project", project);
  url.searchParams.set("tagName", safeTagName);

  if (safeBuildName) {
    url.searchParams.set("buildName", safeBuildName);
  }

 
  const data = await fetchJsonWithAuth(url, token, signal);
  const items = normalizeItems(data);

  const active = items.filter((item) => {
    return getIssueState(item).toLowerCase() === "active";
  });

  return active.map((item) => ({
    id: item?.WorkItemId ?? item?.id ?? "",
    title:
      item?.Title ??
      item?.title ??
      item?.fields?.["System.Title"] ??
      "",
    status:
      item?.State ??
      item?.state ??
      item?.fields?.["System.State"] ??
      "Active",
    buildName:
      item?.BuildName ??
      item?.buildName ??
      item?.fields?.["Custom.BuildName"] ??
      safeBuildName,
    buildVersion:
      item?.BuildVersion ??
      item?.buildVersion ??
      item?.TagName ??
      item?.tagName ??
      safeTagName,
  }));
}

export async function fetchIssues(
  api = ISSUES_API_DEFAULT,
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

  const safeTagName = String(tagName || "").trim();
  const safeBuildName = String(buildName || "").trim();

  url.searchParams.set("organization", organization);
  url.searchParams.set("project", project);

  if (safeBuildName) {
    url.searchParams.set("buildName", safeBuildName);
  }

  if (safeTagName) {
    url.searchParams.set("tagName", safeTagName);
    url.searchParams.set("tag", safeTagName);
  }

 
  const data = await fetchJsonWithAuth(url, token, signal);
  const items = normalizeItems(data);
 

  return data;
}

