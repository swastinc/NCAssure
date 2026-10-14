// src/api/signoffApi.js
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/signoff";
const USERS_QA_PRIVILEGED = "/api/users/qaprivileged";

function stripHelperOptions(opts = {}) {
  const {
    base,
    token,
    authToken,
    ...requestOptions
  } = opts;

  return requestOptions;
}

/** internal helper */
async function request(
  url,
  { signal, headers, token, authToken, ...init } = {},
  retried = false
) {
  const backendToken = await resolveBackendApiToken(
    token || authToken,
    "signoff"
  );

  const finalHeaders = {
    Accept: "application/json",
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    Authorization: `Bearer ${backendToken}`,
    ...(headers || {}),
  };

  const res = await fetch(url, {
    headers: finalHeaders,
    credentials: "include",
    signal,
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      if (!retried) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return request(
            url,
            {
              signal,
              headers,
              token: freshToken,
              ...init,
            },
            true
          );
        }
      }

      throw createUnauthorizedSessionError(
        text || "Unauthorized. Please sign in again.",
        "signoff"
      );
    }

    if (!retried && isUnauthorizedPayloadMessage(text)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return request(
          url,
          {
            signal,
            headers,
            token: freshToken,
            ...init,
          },
          true
        );
      }

      throw createUnauthorizedSessionError(text, "signoff");
    }

    const error = new Error(`${init.method || "GET"} ${url} failed: ${res.status} ${text}`);
    error.status = res.status;
    throw error;
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/** normalize SignoffRequest payload */
function normalizeSignoffRequest(payload = {}) {
  const s = (v) => (v == null ? "" : String(v));

  const emails = Array.isArray(payload.approvedByEmails)
    ? payload.approvedByEmails.filter(Boolean)
    : [];

  const body = {
    project: s(payload.project).trim(),
    buildName: s(payload.buildName).trim(),
    version: s(payload.version).trim(),
    dateChanged: s(payload.dateChanged).trim(), // "YYYY-MM-DD"
    completedBy: s(payload.completedBy).trim(),
    approvedBy: s(payload.approvedBy).trim(),
    approvedByEmails: emails,
    description: s(payload.description).trim(),
    reason: s(payload.reason).trim(),
    testEnvironment: s(payload.testEnvironment).trim(),
    risksAssumptions: s(payload.risksAssumptions).trim(),
    conclusion: s(payload.conclusion).trim(),
    signOffPdfLink: s(payload.signOffPdfLink || payload.pdfPath).trim(),
    totalDesignTestCases: s(payload.totalDesignTestCases).trim(),
    totalPass: s(payload.totalPass).trim(),
    totalFail: s(payload.totalFail).trim(),
  };

  if (typeof payload.isApproved === "boolean") {
    body.isApproved = payload.isApproved;
  } else if (typeof payload.approved === "boolean") {
    body.isApproved = payload.approved;
  }

  return body;
}

/** normalize payload for PUT /api/signoff/{id} */
function normalizeSignoffUpdate(payload = {}) {
  return normalizeSignoffRequest(payload);
}



export async function getAllSignoffs(opts = {}) {
  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}`, {
    method: "GET",
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}

export async function getSignoffById(id, opts = {}) {
  if (!id) throw new Error("id is required");
  const enc = encodeURIComponent(id);
  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}/${enc}`, {
    method: "GET",
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}

export async function approveSignoffById(id, { note } = {}, opts = {}) {
  if (!id) throw new Error("id is required");
  const params = new URLSearchParams({
    id: String(id || "").trim(),
    note: String(note || "").trim(),
  });
  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}/approveSignOffs?${params.toString()}`, {
    method: "POST",
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}

export async function rejectSignoffById(id, { note } = {}, opts = {}) {
  if (!id) throw new Error("id is required");
  const params = new URLSearchParams({
    id: String(id || "").trim(),
    note: String(note || "").trim(),
  });
  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}/rejectSignOffs?${params.toString()}`, {
    method: "POST",
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}

export async function fetchQAPrivilegedNamesAndRoles(opts = {}) {
  const requestOptions = stripHelperOptions(opts);
  const res = await request(`${BASE_URL}${USERS_QA_PRIVILEGED}`, {
    method: "GET",
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
  const users = res;

  // return only what you asked: name + role
  return (Array.isArray(users) ? users : []).map((u) => ({
    name: u?.name ?? "",
    role: u?.role ?? "",
    email: u?.email ?? "",
    username: u?.username ?? "",
  }));
}

// ✅ REJECT SIGNOFF (manager action)
// POST /api/signoff/reject?id=...
// export async function rejectSignoffById(id, opts = {}) {
//   if (!id) throw new Error("id is required");
//   const enc = encodeURIComponent(id);
//   return request(`${BASE_URL}${ENDPOINT}/reject?id=${enc}`, {
//     method: "POST",
//     ...opts,
//   });
// }


export async function getAllSignoffsPendingApproval(opts = {}) {
  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}/getPendingSignOffs`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(requestOptions.headers || {}),
    },
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}



export async function saveSignoff(requestBody = {}, opts = {}) {
  const body = normalizeSignoffRequest(requestBody);

  if (!body.project) throw new Error("project is required");
  if (!body.version) throw new Error("version is required");
  if (!body.dateChanged) throw new Error("dateChanged is required");

  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}/save`, {
    method: "POST",
    body: JSON.stringify(body),
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}

// Optional notification helper
export async function sendSignoffNotification(payload = {}, opts = {}) {
  const recipients = Array.isArray(payload.recipients) ? payload.recipients.filter(Boolean) : [];
  if (!recipients.length) return null;

  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}/notify`, {
    method: "POST",
    body: JSON.stringify({
      recipients,
      project: payload.project || "",
      version: payload.version || "",
      link: payload.link || payload.signOffPdfLink || "",
    }),
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}

export async function updateSignoff(id, requestBody = {}, opts = {}) {
  if (!id) throw new Error("id is required");
  const body = normalizeSignoffUpdate(requestBody);

  const url = `${BASE_URL}${ENDPOINT}/${encodeURIComponent(id)}`;
  const requestOptions = stripHelperOptions(opts);

  return request(url, {
    method: "PUT",
    body: JSON.stringify(body),
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}

export async function getSignoffOverview(project, opts = {}) {
  const projectValue = String(project || "").trim();
  if (!projectValue) throw new Error("project is required");

  const params = new URLSearchParams({ project: projectValue });
  const requestOptions = stripHelperOptions(opts);
  return request(`${BASE_URL}${ENDPOINT}/overview?${params.toString()}`, {
    method: "GET",
    ...requestOptions,
    token: opts.token || opts.authToken,
  });
}
