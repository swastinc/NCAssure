export const UNAUTHORIZED_SESSION_EVENT = "qa-portal:unauthorized-session";

const UNAUTHORIZED_EVENT_COOLDOWN_MS = 4000;

let lastUnauthorizedSignature = "";
let lastUnauthorizedAt = 0;

export function createUnauthorizedError(message = "Unauthorized. Please sign in again.") {
  const error = new Error(parseUnauthorizedMessage(message));
  error.status = 401;
  return error;
}

function parseUnauthorizedMessage(message) {
  const raw = String(message || "").trim();

  if (!raw) {
    return "Your session has expired. Please sign in again.";
  }

  const candidates = [raw];
  const unauthorizedPrefixMatch = raw.match(/^Unauthorized:\s*(.+)$/i);

  if (unauthorizedPrefixMatch?.[1]) {
    candidates.unshift(unauthorizedPrefixMatch[1].trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const parsedMessage =
        parsed?.message ||
        parsed?.error ||
        candidate;

      return String(parsedMessage || candidate).trim();
    } catch {
      // try next candidate
    }
  }

  return raw;
}

export function isUnauthorizedError(error) {
  return (
    error?.status === 401 ||
    error?.response?.status === 401 ||
    /unauthorized|sign in again|session expired/i.test(String(error?.message || ""))
  );
}

export function shouldTriggerReauthentication(message) {
  const text = String(message || "").trim().toLowerCase();

  if (!text) {
    return true;
  }

  return (
    text.includes("session expired") ||
    text.includes("sign in again") ||
    text.includes("authenticate again") ||
    text.includes("no signed-in account") ||
    text.includes("no session") ||
    text.includes("token is expired") ||
    text.includes("token is invalid") ||
    text.includes("not trusted") ||
    text.includes("invalid authorization header") ||
    text.includes("missing authorization header") ||
    text.includes("bearer token is empty")
  );
}

export function notifyUnauthorizedSession(detail = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedMessage = parseUnauthorizedMessage(
    detail?.message || "Your session has expired. Please sign in again."
  );
  const source = detail?.source || "api";
  const signature = `${source}:${normalizedMessage}`;
  const now = Date.now();

  if (
    signature === lastUnauthorizedSignature &&
    now - lastUnauthorizedAt < UNAUTHORIZED_EVENT_COOLDOWN_MS
  ) {
    return;
  }

  lastUnauthorizedSignature = signature;
  lastUnauthorizedAt = now;

  window.dispatchEvent(
    new CustomEvent(UNAUTHORIZED_SESSION_EVENT, {
      detail: {
        message: normalizedMessage,
        source,
      },
    })
  );
}
