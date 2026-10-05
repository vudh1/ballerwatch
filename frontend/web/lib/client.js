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
  const { retryNetwork = false, ...requestOptions } = options;
  const attempts = retryNetwork ? 2 : 1;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(API_ORIGIN + path, {
        cache: "no-store",
        ...requestOptions,
        headers: {
          "content-type": "application/json",
          ...(requestOptions.headers || {}),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.error || `Request failed (HTTP ${response.status})`);
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const networkFailure =
        error instanceof TypeError ||
        /load failed|failed to fetch/i.test(String(error?.message || ""));
      if (!retryNetwork || !networkFailure || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError || new Error("Request failed.");
}
