// api/users.js - backend user helpers

import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  normalizeBackendToken,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_BASE = `${BASE_URL}/api/users`;

let manualAuthToken = null;

export function setAuthToken(token) {
  manualAuthToken = token || null;
}

function stripHelperOptions(opts = {}) {
  const {
    base,
    token,
    authToken,
    ...requestOptions
  } = opts;

  return requestOptions;
}

async function parseResponse(res) {
  const text = await res.text().catch(() => "");
  const contentType = res.headers.get("content-type") || "";

  if (!text) {
    return null;
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

async function apiRequest(path, init = {}, opts = {}, retried = false) {
  const token = await resolveBackendApiToken(
    opts.token || opts.authToken || manualAuthToken,
    "users"
  );

  const headers = {
    Accept: "application/json",
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    Authorization: `Bearer ${token}`,
    ...(init.headers || {}),
  };

  const res = await fetch(`${opts.base || API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (res.status === 404) {
    return null;
  }

  const payload = await parseResponse(res);

  if (res.status === 401) {
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return apiRequest(
          path,
          init,
          {
            ...opts,
            token: freshToken,
          },
          true
        );
      }
    }

    const message =
      payload?.message ||
      payload?.error ||
      (typeof payload === "string" ? payload : "") ||
      "Unauthorized. Please sign in again.";
    throw createUnauthorizedSessionError(message, "users");
  }

  if (!res.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      (typeof payload === "string" ? payload : "") ||
      `HTTP ${res.status}`;

    if (!retried && isUnauthorizedPayloadMessage(message)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return apiRequest(
          path,
          init,
          {
            ...opts,
            token: freshToken,
          },
          true
        );
      }

      throw createUnauthorizedSessionError(message, "users");
    }

    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return payload;
}

export async function getUserByEmail(email, opts = {}) {
  const e = String(email || "").trim();

  if (!e) {
    throw new Error("email is required");
  }

  return apiRequest(
    `/${encodeURIComponent(e)}`,
    { method: "GET", ...stripHelperOptions(opts) },
    opts
  );
}

export async function registerUser(email, name, opts = {}) {
  const e = String(email || "").trim();
  const n = String(name || "").trim();

  if (!e) {
    throw new Error("email is required");
  }

  if (!n) {
    throw new Error("name is required");
  }

  return apiRequest(
    "",
    {
      method: "POST",
      body: JSON.stringify({
        email: e,
        name: n,
        role: "DEFAULTUSER",
        department: "DEFAULT",
      }),
      ...stripHelperOptions(opts),
    },
    opts
  );
}

export async function getQAPrivilegedUsers(opts = {}) {
  return apiRequest("/qaprivileged", { method: "GET", ...stripHelperOptions(opts) }, opts);
}

export async function getQAEngineersUsers(opts = {}) {
  return apiRequest("/qaengprivileged", { method: "GET", ...stripHelperOptions(opts) }, opts);
}

export async function getDevManagers(opts = {}) {
  return apiRequest("/devmanagers", { method: "GET", ...stripHelperOptions(opts) }, opts);
}

export async function getAllUsers(opts = {}) {
  return apiRequest("", { method: "GET", ...stripHelperOptions(opts) }, opts);
}

export async function updateUserRole(email, role, opts = {}) {
  const e = String(email || "").trim();
  const r = String(role || "").trim();

  if (!e) {
    throw new Error("email is required");
  }

  if (!r) {
    throw new Error("role is required");
  }

  return apiRequest(
    "/role",
    {
      method: "PUT",
      body: JSON.stringify({
        email: e,
        role: r,
      }),
      ...stripHelperOptions(opts),
    },
    opts
  );
}

export async function markBuildApprovalsSeen(opts = {}) {
  return apiRequest(
    "/notifications/build-approvals/mark-seen",
    { method: "POST", ...stripHelperOptions(opts) },
    opts
  );
}
export async function fetchBuildApprovalUnreadCount(opts = {}) {
  const payload = await apiRequest(
    "/notifications/build-approvals/unread-count",
    { method: "GET", ...stripHelperOptions(opts) },
    opts
  );

  return Number(payload?.count || 0);
}

export async function markSignoffApprovalsSeen(opts = {}) {
  return apiRequest(
    "/notifications/signoff-approvals/mark-seen",
    { method: "POST", ...stripHelperOptions(opts) },
    opts
  );
}
export async function fetchSignoffApprovalUnreadCount(opts = {}) {
  const payload = await apiRequest(
    "/notifications/signoff-approvals/unread-count",
    { method: "GET", ...stripHelperOptions(opts) },
    opts
  );

  return Number(payload?.count || 0);
}

