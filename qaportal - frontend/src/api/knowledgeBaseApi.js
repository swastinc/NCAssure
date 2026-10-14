// src/api/knowledgeBaseApi.js
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/knowledge-base";

async function request(path, { signal, token, authToken, ...init } = {}, retried = false) {
  const url = `${BASE_URL}${path}`;
  const backendToken = await resolveBackendApiToken(
    token || authToken,
    "knowledge-base"
  );

  const res = await fetch(url, {
    ...init,
    signal,
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await res.text().catch(() => "");

  if (res.status === 401) {
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return request(path, { signal, token: freshToken, ...init }, true);
      }
    }

    throw createUnauthorizedSessionError(
      text || "Unauthorized. Please sign in again.",
      "knowledge-base"
    );
  }

  if (!res.ok) {
    if (!retried && isUnauthorizedPayloadMessage(text)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return request(path, { signal, token: freshToken, ...init }, true);
      }

      throw createUnauthorizedSessionError(
        text || "Unauthorized. Please sign in again.",
        "knowledge-base"
      );
    }

    const error = new Error(
      `${init.method || "GET"} ${url} failed: ${res.status} ${text}`
    );
    error.status = res.status;
    throw error;
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? JSON.parse(text || "null") : text;
}

function normalizeItem(payload = {}) {
  const s = (v) => (v == null ? "" : String(v));
  return {
    ...(payload.id ? { id: String(payload.id) } : {}),
    title: s(payload.title).trim(),
    link: s(payload.link).trim(),
    description: s(payload.description).trim(),
    ...(payload.createdDate ? { createdDate: String(payload.createdDate) } : {}),
  };
}

export async function createKnowledgeBaseItem(payload = {}, opts = {}) {
  const body = normalizeItem(payload);

  if (!body.title) {
    throw new Error("title is required");
  }

  if (!body.link) {
    throw new Error("link is required");
  }

  return request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      title: body.title,
      link: body.link,
      description: body.description,
    }),
    ...opts,
  });
}

export async function getAllKnowledgeBaseItems(opts = {}) {
  return request(ENDPOINT, { method: "GET", ...opts });
}

export async function getKnowledgeBaseItemById(id, opts = {}) {
  const safeId = String(id || "").trim();
  if (!safeId) throw new Error("id is required");
  return request(`${ENDPOINT}/${safeId}`, { method: "GET", ...opts });
}

export async function updateKnowledgeBaseItem(id, payload = {}, opts = {}) {
  const safeId = String(id || "").trim();

  if (!safeId) {
    throw new Error("id is required");
  }

  const body = normalizeItem(payload);

  return request(`${ENDPOINT}/${safeId}`, {
    method: "PUT",
    body: JSON.stringify({
      id: safeId,
      title: body.title,
      link: body.link,
      description: body.description,
    }),
    ...opts,
  });
}

export async function deleteKnowledgeBaseItem(id, opts = {}) {
  const safeId = String(id || "").trim();
  if (!safeId) throw new Error("id is required");

  return request(`${ENDPOINT}/${safeId}`, { method: "DELETE", ...opts });
}
