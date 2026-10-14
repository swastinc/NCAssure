import { getBackendApiTokenAsync } from "../config/msalConfig";
import {
  createUnauthorizedError,
  notifyUnauthorizedSession,
  shouldTriggerReauthentication,
} from "../config/unauthorizedSession";

const BACKEND_API_SCOPE = import.meta.env.VITE_BACKEND_API_SCOPE || "";

export function normalizeBackendToken(token) {
  const value = String(token ?? "").trim();

  if (!value) {
    return "";
  }

  const normalized = value.startsWith("Bearer ")
    ? value.slice(7).trim()
    : value;

  if (!normalized || /^(undefined|null)$/i.test(normalized)) {
    return "";
  }

  return normalized;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getExpectedBackendAudiences() {
  const expected = new Set();
  const match = BACKEND_API_SCOPE.match(/^api:\/\/([^/]+)(?:\/.*)?$/i);

  if (match?.[1]) {
    expected.add(match[1]);
    expected.add(`api://${match[1]}`);
  }

  return expected;
}

function isExpectedBackendAudience(aud) {
  if (!aud) return false;

  const expected = getExpectedBackendAudiences();
  if (!expected.size) return true;

  if (Array.isArray(aud)) {
    return aud.some((value) => expected.has(String(value || "").trim()));
  }

  return expected.has(String(aud).trim());
}

function isTrustedBackendApiToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return false;
  }

  return isExpectedBackendAudience(payload.aud);
}

export function isUnauthorizedPayloadMessage(message) {
  const text = String(message || "");
  return /401\s+unauthorized|token is expired|token is invalid|not trusted|expired or invalid|unauthorized/i.test(
    text
  );
}

export function throwMissingBackendToken(source = "api") {
  const error = createUnauthorizedError("Session expired. Please sign in again.");
  notifyUnauthorizedSession({ message: error.message, source });
  throw error;
}

export async function resolveBackendApiToken(token, source = "api") {
  const directToken = normalizeBackendToken(token);

  if (directToken && isTrustedBackendApiToken(directToken)) {
    return directToken;
  }

  if (directToken) {
    console.warn(
      `[backendAuth] Ignoring caller-supplied token for ${source} because its audience does not match the backend API scope.`
    );
  }

  const acquired = await getBackendApiTokenAsync().catch(() => null);
  const normalized = normalizeBackendToken(acquired);

  if (!normalized) {
    throwMissingBackendToken(source);
  }

  return normalized;
}

export async function getFreshBackendApiToken() {
  const acquired = await getBackendApiTokenAsync({ forceRefresh: true }).catch(
    () => null
  );
  return normalizeBackendToken(acquired);
}

export function createUnauthorizedSessionError(message, source = "api") {
  const error = createUnauthorizedError(
    message || "Unauthorized. Please sign in again."
  );

  if (shouldTriggerReauthentication(error.message)) {
    notifyUnauthorizedSession({ message: error.message, source });
  }

  return error;
}
