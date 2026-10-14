// src/config/msalConfig.js
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  EventType,
} from "@azure/msal-browser";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const AZURE_CLIENT_ID = import.meta.env.VITE_AZUREAD_CLIENT_ID;
const AZURE_TENANT_ID = import.meta.env.VITE_AZUREAD_TENANT_ID;
const BACKEND_API_SCOPE = import.meta.env.VITE_BACKEND_API_SCOPE;

const REDIRECT_PATH =
  import.meta.env.VITE_AZUREAD_REDIRECT_PATH || "/auth/callback";

const REDIRECT_URI = `${window.location.origin}${REDIRECT_PATH}`;
const LOGOUT_REDIRECT_URI = `${window.location.origin}/login`;

const LOGIN_ROUTE = "/login";
const AUTH_CALLBACK_ROUTE = REDIRECT_PATH;

/**
 * MSAL token cache will use localStorage.
 * But selected account must stay per tab.
 *
 * Reason:
 * localStorage is shared across tabs.
 * sessionStorage is per tab.
 */
const TAB_ACTIVE_ACCOUNT_KEY = "qa_portal_tab_active_home_account_id";

/**
 * Old localStorage key from previous implementation.
 * Do not use this for restoring user.
 */
const LAST_ACTIVE_ACCOUNT_KEY = "qa_portal_last_active_home_account_id";

if (!API_BASE_URL || !AZURE_CLIENT_ID || !AZURE_TENANT_ID || !BACKEND_API_SCOPE) {
  throw new Error(
    "Missing MSAL env vars. Required: VITE_API_BASE_URL, VITE_AZUREAD_CLIENT_ID, VITE_AZUREAD_TENANT_ID, VITE_BACKEND_API_SCOPE"
  );
}

export const BACKEND_API_SCOPES = [BACKEND_API_SCOPE];

export const GRAPH_SCOPES = [
  "User.Read",
  "User.ReadBasic.All",
  "GroupMember.Read.All",
  "RoleManagement.Read.Directory",
  "RoleEligibilitySchedule.ReadWrite.Directory"
];

export const ADO_SCOPES = [
  "499b84ac-1321-427f-aa17-267ca6975798/user_impersonation",
];

export const loginRequest = {
  scopes: ["openid", "profile", "email", ...BACKEND_API_SCOPES],
  prompt: "select_account",
};

export const msalConfig = {
  auth: {
    clientId: AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: LOGOUT_REDIRECT_URI,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    /**
     * Use localStorage for MSAL token/account cache.
     *
     * This allows:
     * - Refresh page: token cache remains.
     * - New tab: MSAL can see cached accounts.
     * - Browser close/open: login cache can remain.
     */
    cacheLocation: "localStorage",

    /**
     * Keep false unless old browser/IE workaround is required.
     */
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

let initialized = false;
let initializePromise = null;
let redirectResponseHandled = false;

function saveActiveAccountForThisTab(account) {
  if (!account?.homeAccountId) {
    return;
  }

  /**
   * Keep this in sessionStorage only.
   *
   * Do not move this to localStorage.
   * If this is localStorage, one tab login will overwrite another tab.
   */
  sessionStorage.setItem(TAB_ACTIVE_ACCOUNT_KEY, account.homeAccountId);

  /**
   * Set MSAL active account for the current running app instance.
   * On refresh, ensureActiveAccount() will restore the account from this tab key.
   */
  msalInstance.setActiveAccount(account);
}

function clearActiveAccountForThisTab() {
  sessionStorage.removeItem(TAB_ACTIVE_ACCOUNT_KEY);
  msalInstance.setActiveAccount(null);
}

function clearLastActiveAccount() {
  localStorage.removeItem(LAST_ACTIVE_ACCOUNT_KEY);
}

function findAccountByHomeAccountId(homeAccountId) {
  if (!homeAccountId) {
    return null;
  }

  const accounts = msalInstance.getAllAccounts();

  return (
    accounts.find((account) => account.homeAccountId === homeAccountId) || null
  );
}

function getTabSavedAccount() {
  const tabHomeAccountId = sessionStorage.getItem(TAB_ACTIVE_ACCOUNT_KEY);
  return findAccountByHomeAccountId(tabHomeAccountId);
}

function getFirstAvailableAccount() {
  const accounts = msalInstance.getAllAccounts();

  if (accounts.length === 1) {
    return accounts[0];
  }

  return null;
}

/**
 * Only login success should change selected account.
 * Do not set active account on ACQUIRE_TOKEN_SUCCESS.
 */
msalInstance.addEventCallback((event) => {
  if (
    event.eventType === EventType.LOGIN_SUCCESS ||
    event.eventType === EventType.SSO_SILENT_SUCCESS
  ) {
    const account = event.payload?.account;

    if (account) {
      saveActiveAccountForThisTab(account);
    }
  }

  if (event.eventType === EventType.LOGOUT_SUCCESS) {
    clearActiveAccountForThisTab();
    clearLastActiveAccount();
    clearAppSessionOnly();
  }
});

export async function initializeMsal() {
  if (initialized) {
    ensureActiveAccount();
    return;
  }

  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    if (typeof msalInstance.initialize === "function") {
      await msalInstance.initialize();
    }

    if (!redirectResponseHandled) {
      const response = await msalInstance.handleRedirectPromise();
      redirectResponseHandled = true;

      if (response?.account) {
        saveActiveAccountForThisTab(response.account);
      }
    }

    initialized = true;
    ensureActiveAccount();
  })();

  return initializePromise;
}

export function ensureActiveAccount() {
  /**
   * 1. First priority:
   * Restore the account selected for this exact browser tab.
   *
   * This fixes:
   * - Tab 1 = user A
   * - Tab 2 = user B
   * - Refresh Tab 1
   * - Tab 1 still stays user A
   */
  const tabAccount = getTabSavedAccount();

  if (tabAccount) {
    msalInstance.setActiveAccount(tabAccount);
    return tabAccount;
  }

  /**
   * 2. If only one account exists in MSAL localStorage cache, use it.
   *
   * Safe case:
   * - Only one account is cached.
   */
  const singleAccount = getFirstAvailableAccount();

  if (singleAccount) {
    saveActiveAccountForThisTab(singleAccount);
    return singleAccount;
  }

  /**
   * 3. Do not use msalInstance.getActiveAccount() here.
   *
   * With cacheLocation localStorage, MSAL active account can be shared/changed
   * by another tab. Using it here causes the old tab to switch to the new tab's user.
   */
  return null;
}

function createAuthError(code, message, originalError = null) {
  const error = new Error(message);
  error.code = code;
  error.originalError = originalError;
  return error;
}

function getMsalErrorCode(error) {
  return error?.errorCode || error?.code || "";
}

function getMsalSubError(error) {
  return error?.subError || "";
}

function getMsalErrorMessage(error) {
  return error?.message || "";
}

function isInteractionRequiredError(error) {
  const errorCode = getMsalErrorCode(error);
  const subError = getMsalSubError(error);
  const message = getMsalErrorMessage(error).toLowerCase();

  return (
    error instanceof InteractionRequiredAuthError ||
    errorCode === "interaction_required" ||
    errorCode === "login_required" ||
    errorCode === "consent_required" ||
    subError === "interaction_required" ||
    subError === "login_required" ||
    subError === "consent_required" ||
    message.includes("interaction_required") ||
    message.includes("login_required") ||
    message.includes("consent_required")
  );
}

function isConsentRequiredError(error) {
  const errorCode = getMsalErrorCode(error);
  const subError = getMsalSubError(error);
  const message = getMsalErrorMessage(error).toLowerCase();

  return (
    errorCode === "consent_required" ||
    subError === "consent_required" ||
    message.includes("aadsts65001") ||
    message.includes("aadsts90094") ||
    message.includes("admin approval") ||
    message.includes("consent")
  );
}

function isLoginRequiredError(error) {
  const errorCode = getMsalErrorCode(error);
  const subError = getMsalSubError(error);
  const message = getMsalErrorMessage(error).toLowerCase();

  return (
    errorCode === "login_required" ||
    subError === "login_required" ||
    message.includes("login_required") ||
    message.includes("aadsts50058") ||
    message.includes("no user is signed in")
  );
}

function clearAppSessionOnly() {
  try {
    /**
     * Do not use localStorage user/isAuthenticated for rendering.
     * User should always come from MSAL account.
     */
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("user");
    localStorage.removeItem(LAST_ACTIVE_ACCOUNT_KEY);

    sessionStorage.removeItem("isAuthenticated");
    sessionStorage.removeItem("user");
    sessionStorage.removeItem(TAB_ACTIVE_ACCOUNT_KEY);
  } catch (error) {
    console.error("Failed to clear app session:", error);
  }
}

function removeStorageKeys(storage, predicate) {
  if (!storage) {
    return;
  }

  const keysToRemove = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key && predicate(key)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}

/**
 * Use this for:
 * - Fresh login in current tab
 * - Switch account in current tab
 *
 * Important:
 * Do not clear MSAL localStorage cache here.
 * MSAL localStorage cache is shared by all tabs.
 *
 * If you clear all msal.* localStorage keys here, old tabs will lose their account cache.
 */
export async function clearClientSessionForFreshLogin(options = {}) {
  const { clearMsalLocalCache = false } = options;

  try {
    await initializeMsal();
  } catch (error) {
    console.error("Failed to initialize MSAL before clearing session:", error);
  }

  clearActiveAccountForThisTab();
  clearLastActiveAccount();
  clearAppSessionOnly();

  try {
    /**
     * Clear your custom app cache only.
     * Be careful: these are shared across tabs because they are localStorage.
     * If these values are user-specific, store them with homeAccountId in the key.
     */
    localStorage.removeItem("project");
    localStorage.removeItem("build");
    localStorage.removeItem("navbar");

    /**
     * Clear temporary MSAL keys from this tab only.
     * This can help with stuck interaction_in_progress issues.
     */
    removeStorageKeys(sessionStorage, (key) => /^msal\./i.test(key));

    /**
     * Do this only for troubleshooting/reset button.
     * Do not do this during normal login.
     */
    if (clearMsalLocalCache) {
      removeStorageKeys(localStorage, (key) => /^msal\./i.test(key));

      if (typeof msalInstance.clearCache === "function") {
        await msalInstance.clearCache();
      }
    }
  } catch (error) {
    console.error("Failed to clear browser storage for fresh login:", error);
  }
}

function redirectToLogin(reason = "session_expired") {
  const currentPath = window.location.pathname;

  if (
    currentPath === LOGIN_ROUTE ||
    currentPath === "/" ||
    currentPath === AUTH_CALLBACK_ROUTE
  ) {
    return;
  }

  clearActiveAccountForThisTab();
  clearAppSessionOnly();

  const loginUrl = `${window.location.origin}${LOGIN_ROUTE}?reason=${encodeURIComponent(
    reason
  )}`;

  window.location.replace(loginUrl);
}

function clearLoginReasonFromUrl() {
  if (window.location.pathname !== LOGIN_ROUTE) {
    return;
  }

  const params = new URLSearchParams(window.location.search);

  if (!params.has("reason")) {
    return;
  }

  params.delete("reason");

  const newSearch = params.toString();
  const newUrl = newSearch ? `${LOGIN_ROUTE}?${newSearch}` : LOGIN_ROUTE;

  window.history.replaceState({}, "", newUrl);
}

export async function loginWithRedirect() {
  await initializeMsal();

  clearLoginReasonFromUrl();

  /**
   * Clear only current tab selection.
   * Do not clear MSAL localStorage cache here.
   */
  await clearClientSessionForFreshLogin({
    clearMsalLocalCache: false,
  });

  return msalInstance.loginRedirect({
    ...loginRequest,
    prompt: "select_account",
  });
}

export async function logout() {
  await initializeMsal();

  const account = ensureActiveAccount();

  clearActiveAccountForThisTab();
  clearLastActiveAccount();
  clearAppSessionOnly();

  return msalInstance.logoutRedirect({
    account: account || undefined,
    postLogoutRedirectUri: LOGOUT_REDIRECT_URI,
  });
}

async function acquireToken(scopes, options = {}) {
  const { interactive = false, forceRefresh = false } = options;

  await initializeMsal();

  const account = ensureActiveAccount();

  if (!account) {
    throw createAuthError("NO_SESSION", "No signed-in account found.");
  }

  try {
    const tokenResponse = await msalInstance.acquireTokenSilent({
      account,
      scopes,
      forceRefresh,
    });
 

    try {
      const payload = JSON.parse(atob(tokenResponse.accessToken.split(".")[1]));
 
    } catch (decodeError) {
      console.error("Failed to decode token claims for debug:", decodeError);
    }

    return tokenResponse;
  } catch (error) {
    console.error("Silent token acquisition failed:", error);

    if (!isInteractionRequiredError(error)) {
      throw error;
    }

    if (isConsentRequiredError(error) && !interactive) {
      throw createAuthError(
        "CONSENT_REQUIRED",
        "Consent or admin approval is required for this permission.",
        error
      );
    }

    if (!interactive) {
      throw createAuthError(
        "INTERACTION_REQUIRED",
        "Interactive sign-in is required to continue.",
        error
      );
    }

    await msalInstance.acquireTokenRedirect({
      account,
      scopes,
      redirectStartPage: window.location.href,
    });

    return null;
  }
}

export async function validateSessionOrLogout(options = {}) {
  const { redirect = true } = options;

  await initializeMsal();

  const account = ensureActiveAccount();

  if (!account) {
    if (redirect) {
      redirectToLogin("no_session");
    }

    return false;
  }

  try {
    await msalInstance.acquireTokenSilent({
      account,
      scopes: BACKEND_API_SCOPES,
    });

    return true;
  } catch (error) {
    if (!isInteractionRequiredError(error)) {
      console.error("Session validation failed due to non-auth error:", error);
      return false;
    }

    if (redirect) {
      if (isLoginRequiredError(error)) {
        redirectToLogin("session_expired");
        return false;
      }

      await msalInstance.acquireTokenRedirect({
        account,
        scopes: BACKEND_API_SCOPES,
        redirectStartPage: window.location.href,
      });
    }

    return false;
  }
}

export async function getBackendApiTokenAsync(options = {}) {
  const { interactive = true, forceRefresh = false } = options;

  try {
    const result = await acquireToken(BACKEND_API_SCOPES, {
      interactive,
      forceRefresh,
    });

    return result?.accessToken || null;
  } catch (error) {
    if (error.code === "NO_SESSION") {
      redirectToLogin("no_session");
      return null;
    }

    if (error.code === "INTERACTION_REQUIRED") {
      redirectToLogin("session_expired");
      return null;
    }

    throw error;
  }
}

export async function getGraphTokenAsync(options = {}) {
  const { interactive = true, forceRefresh = false } = options;

  try {
    const result = await acquireToken(GRAPH_SCOPES, {
      interactive,
      forceRefresh,
    });

    return result?.accessToken || null;
  } catch (error) {
    if (error.code === "NO_SESSION") {
      redirectToLogin("no_session");
      return null;
    }

    throw error;
  }
}

export async function getAdoTokenAsync(options = {}) {
  const { interactive = true, forceRefresh = false } = options;

  try {
    const result = await acquireToken(ADO_SCOPES, {
      interactive,
      forceRefresh,
    });

    return result?.accessToken || null;
  } catch (error) {
    if (error.code === "NO_SESSION") {
      redirectToLogin("no_session");
      return null;
    }

    throw error;
  }
}

export function getMsalAccount() {
  return ensureActiveAccount();
}

export function getSignedInUser() {
  const account = ensureActiveAccount();

  if (!account) {
    return null;
  }

  return {
    name: account.name || "",
    username: account.username || "",
    tenantId: account.tenantId || "",
    homeAccountId: account.homeAccountId || "",
    localAccountId: account.localAccountId || "",
    idTokenClaims: account.idTokenClaims || {},
  };
}

export async function getTokenExpiryInfo() {
  await initializeMsal();

  const account = ensureActiveAccount();

  if (!account) {
    return null;
  }

  const result = await msalInstance.acquireTokenSilent({
    account,
    scopes: BACKEND_API_SCOPES,
  });

  return {
    username: account.username,
    accessTokenExpiresOn: result.expiresOn,
    idTokenClaimsExp: account.idTokenClaims?.exp
      ? new Date(account.idTokenClaims.exp * 1000)
      : null,
    note:
      "Access token is usually around 1 hour. SPA refresh token is managed internally by MSAL.",
  };
}

export function isAdminConsentRequiredError(error) {
  return error?.code === "CONSENT_REQUIRED";
}