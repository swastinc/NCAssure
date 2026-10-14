// src/api/fetchBugs.js

import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BUGS_API_DEFAULT = `${import.meta.env.VITE_API_BASE_URL}/api/bugs`;

async function readErrorBody(res) {
  try {
    const text = await res.text();
    return text || res.statusText || "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

async function fetchJsonWithAuth(
  url,
  token,
  signal = undefined,
  retried = false
) {
  const backendApiToken = await resolveBackendApiToken(token, "bugs");

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendApiToken}`,
    },
    signal,
  });

  if (res.status === 401) {
    const text = await readErrorBody(res);

    if (!retried) {
      const freshToken = await getFreshBackendApiToken();

      if (freshToken) {
        return fetchJsonWithAuth(url, freshToken, signal, true);
      }
    }

    throw createUnauthorizedSessionError(text, "bugs");
  }

  if (res.status === 403) {
    const text = await readErrorBody(res);
    const error = new Error(`Forbidden: ${text}`);
    error.status = 403;
    throw error;
  }

  if (!res.ok) {
    const text = await readErrorBody(res);

    if (!retried && isUnauthorizedPayloadMessage(text)) {
      const freshToken = await getFreshBackendApiToken();

      if (freshToken) {
        return fetchJsonWithAuth(url, freshToken, signal, true);
      }

      throw createUnauthorizedSessionError(text, "bugs");
    }

    const error = new Error(`HTTP ${res.status}: ${text}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

function buildBugsUrl(
  api,
  organization,
  project,
  tagValue,
  buildName
) {
  if (!organization || !project) {
    throw new Error("organization and project are required");
  }

  const url = new URL(api);

  url.searchParams.set("organization", organization);
  url.searchParams.set("project", project);

  if (buildName && String(buildName).trim()) {
    url.searchParams.set("buildName", String(buildName).trim());
  }

  if (tagValue && String(tagValue).trim()) {
    url.searchParams.set("tag", String(tagValue).trim());
  }

  return url.toString();
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

function getState(item) {
  return (
    item?.State ??
    item?.state ??
    item?.fields?.["System.State"] ??
    ""
  )
    .toString()
    .trim();
}

function stateToTitle(state) {
  if (!state) {
    return "Unknown";
  }

  const normalized = String(state).trim().toLowerCase();

  if (normalized === "new") {
    return "New";
  }

  if (normalized === "resolved") {
    return "Resolved";
  }

  if (normalized === "active") {
    return "Active";
  }

  if (normalized === "closed") {
    return "Closed";
  }

  return (
    String(state).charAt(0).toUpperCase() +
    String(state).slice(1)
  );
}

export async function fetchBugsList(
  api = BUGS_API_DEFAULT,
  organization,
  project,
  token,
  tag = null,
  signal = undefined,
  buildName = null
) {
  const url = buildBugsUrl(
    api,
    organization,
    project,
    tag,
    buildName
  );

  const data = await fetchJsonWithAuth(
    url,
    token,
    signal
  );

  const items = normalizeItems(data);

  const resolved = items.filter((item) => {
    return getState(item).toLowerCase() === "resolved";
  });

  return resolved.map((item) => ({
    id:
      item?.WorkItemId ??
      item?.id ??
      item?.bugId ??
      "",
    title:
      item?.Title ??
      item?.title ??
      item?.fields?.["System.Title"] ??
      "",
    severity:
      item?.Severity ??
      item?.severity ??
      item?.fields?.["Microsoft.VSTS.Common.Severity"] ??
      "",
  }));
}

export async function fetchBugStats(
  api = BUGS_API_DEFAULT,
  organization,
  project,
  token,
  previousApi = null,
  tag = null,
  signal = undefined,
  buildName = null
) {
  const currentUrl = buildBugsUrl(
    api,
    organization,
    project,
    tag,
    buildName
  );

  const data = await fetchJsonWithAuth(
    currentUrl,
    token,
    signal
  );

  const items = normalizeItems(data);

  const counts = items.reduce((acc, item) => {
    const title = stateToTitle(getState(item));

    acc[title] = (acc[title] || 0) + 1;

    return acc;
  }, {});

  let prevCounts = null;

  if (previousApi) {
    try {
      const previousUrl = buildBugsUrl(
        previousApi,
        organization,
        project,
        tag,
        buildName
      );

      const previousData =
        await fetchJsonWithAuth(
          previousUrl,
          token,
          signal
        );

      const previousItems =
        normalizeItems(previousData);

      prevCounts = previousItems.reduce(
        (acc, item) => {
          const title = stateToTitle(
            getState(item)
          );

          acc[title] =
            (acc[title] || 0) + 1;

          return acc;
        },
        {}
      );
    } catch {
      prevCounts = null;
    }
  }

  const ORDER = [
    "New",
    "Resolved",
    "Active",
    "Closed",
  ];

  const ICONS = {
    New: "🔆",
    Resolved: "✅",
    Active: "🕒",
    Closed: "⚠️",
    Unknown: "📌",
  };

  const RINGS = {
    New: "ring-blue-100",
    Resolved: "ring-green-100",
    Active: "ring-amber-100",
    Closed: "ring-rose-100",
    Unknown: "ring-gray-100",
  };

  const result = ORDER.map((title) => {
    const value = counts[title] || 0;

    let sub = "";

    if (prevCounts) {
      const previousValue =
        prevCounts[title] || 0;

      const diff = value - previousValue;

      if (diff > 0) {
        sub = `+${diff} from previous`;
      } else if (diff < 0) {
        sub = `${diff} from previous`;
      } else {
        sub = "no change from previous";
      }
    }

    return {
      title,
      value,
      sub,
      icon: ICONS[title],
      ring: RINGS[title],
    };
  });

  return result;
}
