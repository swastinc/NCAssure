import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const BUILD_API = `${BASE_URL}/api/builds`;

function normalizeRole(role) {
  return String(role || "USER").toUpperCase().trim();
}

function pickReleasedBy(user) {
  const name = String(user?.username || "").trim();
  if (name) return name;

  const email = String(user?.email || "").trim();
  return email || "";
}

async function parsePayload(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function readTextPayload(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function getBuildText(url, token, source, retried = false) {
  const backendToken = await resolveBackendApiToken(token, source);
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "text/plain, application/json",
      Authorization: `Bearer ${backendToken}`,
    },
  });

  const text = await readTextPayload(res);
  const message = text || `HTTP ${res.status}`;

  if (res.status === 401) {
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return getBuildText(url, freshToken, source, true);
      }
    }

    throw createUnauthorizedSessionError(message, source);
  }

  if (!res.ok) {
    if (!retried && isUnauthorizedPayloadMessage(message)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return getBuildText(url, freshToken, source, true);
      }

      throw createUnauthorizedSessionError(message, source);
    }

    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return text.trim();
}
async function postBuild(url, payload, token, retried = false) {
  const backendToken = await resolveBackendApiToken(token, "release-build");
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await parsePayload(res);
  const message = data?.message || data?.error || `HTTP ${res.status}`;

  if (res.status === 401) {
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return postBuild(url, payload, freshToken, true);
      }
    }

    throw createUnauthorizedSessionError(message, "release-build");
  }

  if (!res.ok) {
    if (!retried && isUnauthorizedPayloadMessage(message)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return postBuild(url, payload, freshToken, true);
      }

      throw createUnauthorizedSessionError(message, "release-build");
    }

    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return data;
}

export async function releaseBuild(payload, opts = {}) {
  const user = opts.user || null;
  const role = normalizeRole(opts.userType || user?.role);
  let nextPayload = payload;

  if (!nextPayload?.releasedBy || !String(nextPayload.releasedBy).trim()) {
    nextPayload = {
      ...nextPayload,
      releasedBy: pickReleasedBy(user),
    };
  }

  if (!nextPayload?.releaseByEmail || !String(nextPayload.releaseByEmail).trim()) {
    nextPayload = {
      ...nextPayload,
      releaseByEmail: String(user?.email || "").trim(),
    };
  }

  const url = `${opts.api || BUILD_API}?userType=${encodeURIComponent(role)}`;
  return postBuild(url, nextPayload, opts.token || opts.authToken);
}
export async function fetchLatestReleasedVersion({ projectName, buildName, token, authToken } = {}) {
  const normalizedProjectName = String(projectName || "").trim();
  const normalizedBuildName = String(buildName || "").trim();

  if (!normalizedProjectName) throw new Error("projectName is required");
  if (!normalizedBuildName) throw new Error("buildName is required");

  const params = new URLSearchParams({
    projectName: normalizedProjectName,
    buildName: normalizedBuildName,
  });

  const url = `${BUILD_API}/latest-released-version?${params.toString()}`;
  return getBuildText(url, token || authToken, "latest-released-version");
}
