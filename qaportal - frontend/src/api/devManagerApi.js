import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BUILD_API = `${import.meta.env.VITE_API_BASE_URL}/api/builds`;

async function parseResponse(res) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

async function requestWithRetry(url, init, source, token, retried = false) {
  const backendToken = await resolveBackendApiToken(token, source);
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${backendToken}`,
      ...(init.headers || {}),
    },
  });

  const payload = await parseResponse(res);
  const message =
    (typeof payload === "object" && payload?.message) ||
    (typeof payload === "string" && payload) ||
    `Request failed (${res.status})`;

  if (res.status === 401) {
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return requestWithRetry(url, init, source, freshToken, true);
      }
    }

    throw createUnauthorizedSessionError(message, source);
  }

  if (!res.ok) {
    if (!retried && isUnauthorizedPayloadMessage(message)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return requestWithRetry(url, init, source, freshToken, true);
      }

      throw createUnauthorizedSessionError(message, source);
    }

    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return payload;
}

export async function approveBuildRpc(id, { notes, note, token, authToken } = {}) {
  const finalNotes = String(notes ?? note ?? "").trim();
  const params = new URLSearchParams({
    id: String(id || "").trim(),
    notes: finalNotes,
  });

  return requestWithRetry(
    `${BUILD_API}/final?${params.toString()}`,
    { method: "POST" },
    "dev-manager",
    token || authToken
  );
}

export async function rejectBuildRpc(
  id,
  {
    approvedBy,
    note,
    token,
    authToken,
  } = {}
) {
  if (!id) {
    throw new Error("Build id is required");
  }

  return requestWithRetry(
    `${BUILD_API}/${encodeURIComponent(id)}/reject`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approvedBy: String(approvedBy || "").trim(),
        note: String(note || "").trim(),
      }),
    },
    "dev-manager",
    token || authToken
  );
}
