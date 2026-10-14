import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/builds";

function buildQuery(params = {}) {
  const qs = new URLSearchParams();

  if (typeof params.isPendingApproval === "boolean") {
    qs.set("isPendingApproval", String(params.isPendingApproval));
  } else {
    qs.set("isPendingApproval", "true");
  }

  if (params.projectName && String(params.projectName).trim()) {
    qs.set("projectName", String(params.projectName).trim());
  }

  if (params.devManagerEmail && String(params.devManagerEmail).trim()) {
    qs.set("devmanageremail", String(params.devManagerEmail).trim());
  }

  const str = qs.toString();
  return str ? `?${str}` : "";
}

async function buildAuthHeaders(headers = {}, token) {
  const finalHeaders = {
    Accept: "application/json",
    ...headers,
  };

  if (!finalHeaders.Authorization) {
    const backendToken = await resolveBackendApiToken(token, "builds");
    finalHeaders.Authorization = `Bearer ${backendToken}`;
  }

  return finalHeaders;
}

function createAbortError() {
  const error = new Error("The request was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function withAbortSignal(promise, signal) {
  if (!signal) return promise;

  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });

    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
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

async function readResponseBody(response) {
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

async function fetchWithBackendAuth(url, init = {}, token, retried = false) {
  const signal = init.signal;
  const headers = await withAbortSignal(buildAuthHeaders(init.headers, token), signal);

  throwIfAborted(signal);

  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });

  const payload = await withAbortSignal(readResponseBody(response), signal);

  if (!response.ok) {
    if (response.status === 401) {
      if (!retried) {
        const freshToken = await withAbortSignal(getFreshBackendApiToken(), signal);
        if (freshToken) {
          return fetchWithBackendAuth(url, init, freshToken, true);
        }
      }

      const message =
        payload?.message ||
        payload?.error ||
        (typeof payload === "string" ? payload : "") ||
        "Unauthorized. Please sign in again.";
      throw createUnauthorizedSessionError(message, "builds");
    }

    const message =
      payload?.message ||
      payload?.error ||
      (typeof payload === "string" ? payload : "") ||
      `HTTP ${response.status}`;

    if (!retried && isUnauthorizedPayloadMessage(message)) {
      const freshToken = await withAbortSignal(getFreshBackendApiToken(), signal);
      if (freshToken) {
        return fetchWithBackendAuth(url, init, freshToken, true);
      }
      throw createUnauthorizedSessionError(message, "builds");
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function assignQaEngineer(projectId, qaAssignee, opts = {}) {
  if (!projectId) throw new Error("projectId is required");
  if (!qaAssignee) throw new Error("qaAssignee is required");

  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);

  const url =
    `${base}${ENDPOINT}/assign-qa` +
    `?projectId=${encodeURIComponent(projectId)}` +
    `&qaAssignee=${encodeURIComponent(qaAssignee)}`;

  return fetchWithBackendAuth(
    url,
    {
      method: "PUT",
      ...requestOptions,
    },
    token
  );
}

export async function getBuildById(id, opts = {}) {
  if (!id) throw new Error("id is required");

  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const url = `${base}${ENDPOINT}/getBuild?id=${encodeURIComponent(id)}`;

  return fetchWithBackendAuth(
    url,
    {
      method: "GET",
      ...requestOptions,
    },
    token
  );
}

export async function fetchBuildsApi(params = {}, opts = {}) {
  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const url = base + ENDPOINT + buildQuery(params);

  return fetchWithBackendAuth(
    url,
    {
      method: "GET",
      ...requestOptions,
    },
    token
  );
}

export const fetchPendingBuilds = (projectName = "", devManagerEmail = "", opts) =>
  fetchBuildsApi({ isPendingApproval: true, projectName, devManagerEmail }, opts);

export const fetchApprovedBuilds = (
  projectName = "",
  devManagerEmail = "",
  opts
) => fetchBuildsApi({ isPendingApproval: false, projectName, devManagerEmail }, opts);

export async function fetchAllApprovedBuilds(devManagerEmail, opts = {}) {
  if (!devManagerEmail || !String(devManagerEmail).trim()) {
    throw new Error("devManagerEmail is required");
  }

  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const url =
    `${base}${ENDPOINT}?isPendingApproval=false&devmanageremail=` +
    encodeURIComponent(String(devManagerEmail).trim());

  return fetchWithBackendAuth(
    url,
    {
      method: "GET",
      ...requestOptions,
    },
    token
  );
}

export async function fetchAllFinalBuilds(opts = {}) {
  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const url = `${base}${ENDPOINT}/allFinalBuilds?isPendingApproval=false`;

  return fetchWithBackendAuth(
    url,
    {
      method: "GET",
      ...requestOptions,
    },
    token
  );
}

export async function fetchFinalBuilds(projectName, opts = {}) {
  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);

  const url = `${base}${ENDPOINT}/getAllFinalBuilds?projectName=${encodeURIComponent(
    projectName
  )}`;

  return fetchWithBackendAuth(
    url,
    {
      method: "GET",
      ...requestOptions,
    },
    token
  );
}

export async function updateBuild(projectId, buildDto, opts = {}) {
  if (!projectId) throw new Error("projectId is required");

  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);
  const url = `${base}${ENDPOINT}/${encodeURIComponent(projectId)}`;

  return fetchWithBackendAuth(
    url,
    {
      ...requestOptions,
      method: "POST",
      headers: {
        ...(requestOptions.headers || {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildDto),
    },
    token
  );
}

export const getLatestBuilds = async (opts = {}) => {
  const base = opts.base || BASE;
  const token = opts.token || opts.authToken;
  const requestOptions = stripHelperOptions(opts);

  return fetchWithBackendAuth(
    `${base}${ENDPOINT}/latest`,
    {
      method: "GET",
      ...requestOptions,
    },
    token
  );
};
