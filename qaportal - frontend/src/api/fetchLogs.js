import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "./backendAuth";

export async function fetchBuildLogs(opts = {}) {
  const url = `${import.meta.env.VITE_API_BASE_URL}/api/builds/logs`;
  const initialToken = await resolveBackendApiToken(
    opts.token || opts.authToken,
    "logs"
  );

  async function requestWithToken(activeToken, retried = false) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${String(activeToken).trim()}`,
      },
    });

    if (response.status === 401) {
      const text = await response.text().catch(() => "");
      if (!retried) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }
      }

      throw createUnauthorizedSessionError(
        text || "Unauthorized. Please sign in again.",
        "logs"
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (!retried && isUnauthorizedPayloadMessage(text)) {
        const freshToken = await getFreshBackendApiToken();
        if (freshToken) {
          return requestWithToken(freshToken, true);
        }

        throw createUnauthorizedSessionError(
          text || "Unauthorized. Please sign in again.",
          "logs"
        );
      }

      throw new Error(
        `Failed to fetch build logs (${response.status})${text ? `: ${text}` : ""}`
      );
    }

    return response.json();
  }

  try {
    return await requestWithToken(initialToken);
  } catch (error) {
    console.error("Error fetching build logs:", error);
    return null;
  }
}
