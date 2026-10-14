// api/centralRepoApi.js
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/centralrepo";

function normalizeOpts(tokenOrOpts) {
  if (typeof tokenOrOpts === "string") {
    return { token: tokenOrOpts };
  }
  return tokenOrOpts && typeof tokenOrOpts === "object" ? tokenOrOpts : {};
}

async function request(url, options = {}, retried = false) {
  const {
    signal,
    token,
    authToken,
    headers: optsHeaders,
    ...rest
  } = options;

  const backendToken = await resolveBackendApiToken(
    token || authToken,
    "central-repo"
  );

  const headers = {
    Accept: "application/json",
    ...(optsHeaders || {}),
    Authorization: `Bearer ${backendToken}`,
  };

  if (
    rest.body &&
    !(optsHeaders && optsHeaders["Content-Type"])
  ) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    credentials: "include",
    ...rest,
    signal,
    headers,
  });

  if (res.status === 401) {
    const text = await res.text().catch(() => "");
    if (!retried) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return request(
          url,
          {
            ...options,
            token: freshToken,
          },
          true
        );
      }
    }
    throw createUnauthorizedSessionError(
      text || "Unauthorized. Please sign in again.",
      "central-repo"
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");

    if (!retried && isUnauthorizedPayloadMessage(text)) {
      const freshToken = await getFreshBackendApiToken();
      if (freshToken) {
        return request(
          url,
          {
            ...options,
            token: freshToken,
          },
          true
        );
      }
      throw createUnauthorizedSessionError(text, "central-repo");
    }

    const error = new Error(
      `${rest.method || "GET"} ${url} failed: ${res.status} ${text}`
    );
    error.status = res.status;
    throw error;
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

const hasText = (v) => v != null && String(v).trim().length > 0;

export async function getCentralRepoByProject(projectName, tokenOrOpts = {}) {
  const name = String(projectName || "").trim();
  if (!name) throw new Error("projectName is required");

  const opts = normalizeOpts(tokenOrOpts);
  const url = `${BASE_URL}${ENDPOINT}/${encodeURIComponent(name)}`;
  const data = await request(url, { method: "GET", ...opts });

  if (Array.isArray(data)) return data[0] || null;

  return data || null;
}

export async function updateCentralRepoPartial(
  projectName,
  partialFields = {},
  tokenOrOpts = {}
) {
  const name = String(projectName || "").trim();
  if (!name) throw new Error("projectName is required");

  const body = { projectName: name };

  if (hasText(partialFields.testCasesTitle)) body.testCasesTitle = String(partialFields.testCasesTitle).trim();
  if (hasText(partialFields.testCasesLink)) body.testCasesLink = String(partialFields.testCasesLink).trim();

  if (hasText(partialFields.defectsTitle)) body.defectsTitle = String(partialFields.defectsTitle).trim();
  if (hasText(partialFields.defectLink)) body.defectLink = String(partialFields.defectLink).trim();

  if (hasText(partialFields.reportsTitle)) body.reportsTitle = String(partialFields.reportsTitle).trim();
  if (hasText(partialFields.reportsLink)) body.reportsLink = String(partialFields.reportsLink).trim();

  const opts = normalizeOpts(tokenOrOpts);

  return request(`${BASE_URL}${ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    ...opts,
  });
}

export async function getAllCentralRepos(tokenOrOpts = {}) {
  const opts = normalizeOpts(tokenOrOpts);
  return request(`${BASE_URL}${ENDPOINT}`, { method: "GET", ...opts });
}
