import axios from "axios";
import {
  getUserAccessTokenAsync,
  handleUnauthorizedApiResponse,
} from "../config/msalConfig";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

let installed = false;
let unauthorizedHandled = false;

function toAbsoluteUrl(url, base = window.location.origin) {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

function isBackendApiUrl(url, baseURL) {
  const absolute = toAbsoluteUrl(url, baseURL || window.location.origin);
  if (!absolute) return false;

  if (API_BASE_URL) {
    const apiBase = toAbsoluteUrl(API_BASE_URL);
    if (apiBase && absolute.origin === apiBase.origin) {
      return absolute.pathname.startsWith(apiBase.pathname);
    }
  }

  return absolute.origin === window.location.origin && absolute.pathname.startsWith("/api/");
}

async function buildAuthHeaders(headersLike) {
  const headers = new Headers(headersLike || {});

  if (!headers.has("Authorization")) {
    const accessToken = await getUserAccessTokenAsync();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  return headers;
}

export function installApiAuth() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const request = new Request(input, init);

    if (!isBackendApiUrl(request.url)) {
      return originalFetch(input, init);
    }

    const headers = await buildAuthHeaders(request.headers);
    const authedRequest = new Request(request, {
      headers,
      credentials: request.credentials === "omit" ? "omit" : "include",
    });

    const response = await originalFetch(authedRequest);

    if (response.status === 401) {
      if (!unauthorizedHandled) {
        unauthorizedHandled = true;
        handleUnauthorizedApiResponse();
      }
    } else {
      unauthorizedHandled = false;
    }

    return response;
  };

  axios.interceptors.request.use(async (config) => {
    const url = config?.url || "";
    if (!isBackendApiUrl(url, config?.baseURL)) {
      return config;
    }

    const accessToken = await getUserAccessTokenAsync();

    config.withCredentials = config.withCredentials ?? true;
    config.headers = config.headers || {};

    if (accessToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      unauthorizedHandled = false;
      return response;
    },
    (error) => {
      const status = error?.response?.status;

      if (status === 401 && !unauthorizedHandled) {
        unauthorizedHandled = true;
        handleUnauthorizedApiResponse();
      }

      return Promise.reject(error);
    }
  );
}
