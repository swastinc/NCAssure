import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ENDPOINT = "/api/confidence/calculate";

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return text || response.statusText || "Request failed";
  } catch {
    return response.statusText || "Request failed";
  }
}

export async function fetchConfidenceScore({
  apiBase = `${BASE_URL}${ENDPOINT}`,
  token,
  authToken,
  organization,
  project,
  tag = "",
  buildName = "",
  signal,
}) {
  if (!organization || !project) {
    throw new Error("Organization and project are required.");
  }

  const params = new URLSearchParams({
    organization,
    project,
  });

  if (tag && String(tag).trim()) {
    params.append("tag", String(tag).trim());
  }

  if (buildName && String(buildName).trim()) {
    params.append("buildName", String(buildName).trim());
  }

  async function requestWithToken(activeToken, retried = false) {
    const response = await fetch(`${apiBase}?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${activeToken}`,
      },
      signal,
    });

    if (response.status === 401) {
      const errorText = await readErrorBody(response);
      if (!retried) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }
      }

      throw createUnauthorizedSessionError(errorText, "confidence");
    }

    if (response.status === 403) {
      const errorText = await readErrorBody(response);
      const error = new Error(`Forbidden: ${errorText}`);
      error.status = 403;
      throw error;
    }

    if (!response.ok) {
      const errorText = await readErrorBody(response);
      if (!retried && isUnauthorizedPayloadMessage(errorText)) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }

        throw createUnauthorizedSessionError(errorText, "confidence");
      }

      const error = new Error(
        `Confidence Score API Error ${response.status}: ${errorText}`
      );
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  const backendToken = await resolveBackendApiToken(
    token || authToken,
    "confidence"
  );
  const payload = await requestWithToken(backendToken);
  const score = Number(payload?.confidenceScore);

  if (!Number.isFinite(score)) {
    throw new Error("Confidence score response did not include a valid number.");
  }

  return score;
}
