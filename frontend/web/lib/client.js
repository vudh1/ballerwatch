export const API_ORIGIN = "https://ballerwatch-web.vudhone.workers.dev";
export const SESSION_TOKEN_KEY = "ballerwatch-owner-token";
export const SESSION_USERNAME_KEY = "ballerwatch-user-name";

export function sessionToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY) || "";
}

export function sessionUsername() {
  return localStorage.getItem(SESSION_USERNAME_KEY) || "admin";
}

export function authHeaders() {
  const token = sessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function saveSession({ token = "", username = "" } = {}) {
  if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
  if (username) localStorage.setItem(SESSION_USERNAME_KEY, username);
}

export function saveSessionUsername(username) {
  const value = String(username || "").trim().toLowerCase();
  if (value) localStorage.setItem(SESSION_USERNAME_KEY, value);
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function requestJson(path, options = {}) {
  const { retryNetwork = false, timeoutMs = 8_000, ...requestOptions } = options;
  const attempts = retryNetwork ? 2 : 1;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // Cap public API hangs so one stalled Worker connection cannot pin
      // the entire PWA on "Checking…" or delay cached scouting cards.
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
      try {
        const response = await fetch(API_ORIGIN + path, {
          cache: "no-store",
          ...requestOptions,
          signal: requestOptions.signal || controller.signal,
          headers: {
            "content-type": "application/json",
            ...(requestOptions.headers || {}),
          },
        });
        // The deadline includes reading/parsing the body, not merely receipt
        // of headers. A stalled response body must never keep the header in
        // Loading/Ready indefinitely.
        const payload = await response.json().catch((error) => {
          if (controller.signal.aborted) throw error;
          return {};
        });
        if (!response.ok || payload.ok === false) {
          const error = new Error(payload.error || `Request failed (HTTP ${response.status})`);
          error.status = response.status;
          throw error;
        }
        return payload;
      } finally {
        clearTimeout(deadline);
      }
    } catch (error) {
      lastError = error;
      const networkFailure =
        error instanceof TypeError || error?.name === "AbortError" ||
        /load failed|failed to fetch/i.test(String(error?.message || ""));
      const safeGet = String(requestOptions.method || "GET").toUpperCase() === "GET";
      const temporaryGatewayError = [502, 503, 504].includes(error?.status);
      if (!retryNetwork || !safeGet || !(networkFailure || temporaryGatewayError) ||
          attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError || new Error("Request failed.");
}
