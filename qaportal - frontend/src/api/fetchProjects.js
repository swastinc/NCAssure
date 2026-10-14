// src/api/fetchProjects.js
import { getBackendApiTokenAsync } from "../config/msalConfig";
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  normalizeBackendToken,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!BASE_URL) {
  throw new Error("Missing VITE_API_BASE_URL");
}

function isAdminConsentError(error) {
  const code = error?.code || error?.errorCode || "";
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "ADMIN_CONSENT_REQUIRED" ||
    code === "consent_required" ||
    code === "interaction_required" ||
    message.includes("admin approval") ||
    message.includes("admin consent") ||
    message.includes("consent required") ||
    message.includes("aadsts65001") ||
    message.includes("aadsts90094")
  );
}

async function getValidBackendApiToken(tokenFromCaller) {
  const directToken = normalizeBackendToken(tokenFromCaller);
  if (directToken) {
    return directToken;
  }

  try {
    const token = await getBackendApiTokenAsync({
      interactive: false,
    });

    return await resolveBackendApiToken(token, "ado-projects");
  } catch (error) {
    if (isAdminConsentError(error)) {
      const consentError = new Error(
        "Admin approval is required for QA Portal backend access. Please ask the Contoso tenant admin to grant consent for QA Portal."
      );

      consentError.status = 403;
      consentError.code = "ADMIN_CONSENT_REQUIRED";
      consentError.originalError = error;

      throw consentError;
    }

    if (error?.code === "NO_SESSION" || error?.message === "NO_SESSION") {
      const sessionError = createUnauthorizedSessionError(
        "Session expired. Please sign in again.",
        "ado-projects"
      );
      sessionError.code = "NO_SESSION";
      sessionError.originalError = error;
      throw sessionError;
    }

    throw error;
  }
}

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

export async function fetchProjects(
  api = `${BASE_URL}/api/ado/projects`,
  token,
  opts = {}
) {
  const {
    token: optsToken,
    authToken,
    onResolvedToken,
    headers: optsHeaders,
    ...fetchOptions
  } = opts;

  const notifyResolvedToken = (value) => {
    const normalized = normalizeBackendToken(value);

    if (!normalized || typeof onResolvedToken !== "function") {
      return;
    }

    onResolvedToken(normalized);
  };

  async function requestWithToken(resolvedToken, retried = false) {
    notifyResolvedToken(resolvedToken);

    const response = await fetch(api, {
      method: "GET",
      credentials: "include",
      // Project membership can change while the portal is open. Never reuse a
      // cached response here, otherwise newly created projects remain absent
      // from manager dropdowns until the browser cache expires.
      cache: "no-store",
      ...fetchOptions,
      headers: {
        Accept: "application/json",
        ...(optsHeaders || {}),
        Authorization: `Bearer ${resolvedToken}`,
      },
    });

    if (response.status === 401) {
      const text = await readErrorBody(response);
      if (!retried) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          notifyResolvedToken(freshToken);
          return requestWithToken(freshToken, true);
        }
      }

      const error = createUnauthorizedSessionError(
        text || "Unauthorized. Please sign in again.",
        "ado-projects"
      );
      error.code = "BACKEND_UNAUTHORIZED";
      throw error;
    }

    if (response.status === 403) {
      const text = await readErrorBody(response);
      const error = new Error(text || "Forbidden. You do not have access.");
      error.status = 403;
      error.code = "BACKEND_FORBIDDEN";
      throw error;
    }

    if (!response.ok) {
      const text = await readErrorBody(response);

      if (!retried && isUnauthorizedPayloadMessage(text)) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }

        const error = createUnauthorizedSessionError(
          text || "Unauthorized. Please sign in again.",
          "ado-projects"
        );
        error.code = "BACKEND_UNAUTHORIZED";
        throw error;
      }

      const error = new Error(
        `fetchProjects failed HTTP ${response.status}${text ? `: ${text}` : ""}`
      );
      error.status = response.status;
      error.code = "BACKEND_ERROR";
      throw error;
    }

    return response.json();
  }

  const backendApiToken = await getValidBackendApiToken(
    token || optsToken || authToken
  );

  notifyResolvedToken(backendApiToken);
  return requestWithToken(backendApiToken);
}
