import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/notifications";

function stripHelperOptions(opts = {}) {
  const { base, token, authToken, ...requestOptions } = opts;
  return requestOptions;
}

async function parseResponse(response) {
  const text = await response.text().catch(() => "");
  const contentType = response.headers.get("content-type") || "";

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

async function request(url, init = {}, token, retried = false) {
  const backendToken = await resolveBackendApiToken(token, "notifications");
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendToken}`,
      ...(init.headers || {}),
    },
  });

  const payload = await parseResponse(response);
  const message =
    payload?.message ||
    payload?.error ||
    (typeof payload === "string" ? payload : "") ||
    `HTTP ${response.status}`;

  if (response.status === 401) {
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return request(url, init, freshToken, true);
      }
    }

    throw createUnauthorizedSessionError(message, "notifications");
  }

  if (!response.ok) {
    if (!retried && isUnauthorizedPayloadMessage(message)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return request(url, init, freshToken, true);
      }

      throw createUnauthorizedSessionError(message, "notifications");
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function createNotification(notification = {}, opts = {}) {
  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const url = `${base}${ENDPOINT}`;

  return request(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestOptions.headers || {}),
      },
      body: JSON.stringify(notification),
      ...requestOptions,
    },
    token
  );
}

export async function fetchNotifications(userId, opts = {}) {
  if (!userId) throw new Error("userId is required");

  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const candidates = [
    `${base}${ENDPOINT}/user/${encodeURIComponent(userId)}`,
    `${base}${ENDPOINT}?userId=${encodeURIComponent(userId)}`,
    `${base}${ENDPOINT}/user?userId=${encodeURIComponent(userId)}`,
  ];

  let lastErr;

  for (const url of candidates) {
    try {
      const payload = await request(
        url,
        {
          method: "GET",
          ...requestOptions,
        },
        token
      );
      return Array.isArray(payload) ? payload : [];
    } catch (err) {
      if (err?.status === 401) {
        throw err;
      }
      lastErr = err;
    }
  }

  throw lastErr || new Error("Unable to fetch notifications");
}

export async function markNotificationRead(id, opts = {}) {
  if (!id) throw new Error("id is required");

  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const candidates = [
    { method: "PATCH", url: `${base}${ENDPOINT}/${encodeURIComponent(id)}/read` },
    { method: "PUT", url: `${base}${ENDPOINT}/${encodeURIComponent(id)}/read` },
    { method: "PUT", url: `${base}${ENDPOINT}/read/${encodeURIComponent(id)}` },
  ];

  let lastErr;

  for (const { method, url } of candidates) {
    try {
      return await request(
        url,
        {
          method,
          ...requestOptions,
        },
        token
      );
    } catch (err) {
      if (err?.status === 401) {
        throw err;
      }
      lastErr = err;
    }
  }

  throw lastErr || new Error("Unable to mark notification read");
}

export async function deleteNotification(id, opts = {}) {
  if (!id) throw new Error("id is required");

  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const url = `${base}${ENDPOINT}/${encodeURIComponent(id)}`;

  await request(
    url,
    {
      method: "DELETE",
      ...requestOptions,
    },
    token
  );

  return true;
}

export default {
  createNotification,
  fetchNotifications,
  markNotificationRead,
  deleteNotification,
};
