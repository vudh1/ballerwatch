/**
 * Validates browser Web Push service endpoints before they enter persistent state
 * or become outbound requests from a GitHub Actions runner.
 *
 * The allowlist is intentionally provider-scoped rather than URL-pattern scoped:
 * subscription paths are opaque capability URLs, while the host must belong to a
 * recognized browser push service.
 */
const EXACT_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
]);

function normalizedHost(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

function looksLikeIpv4(host) {
  const parts = host.split(".");
  return parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function isIpLiteralHostname(value) {
  const host = normalizedHost(value).replace(/^\[/, "").replace(/\]$/, "");
  return looksLikeIpv4(host) || host.includes(":");
}

export function isRecognizedWebPushHost(value) {
  const host = normalizedHost(value);
  if (EXACT_PUSH_HOSTS.has(host)) return true;
  if (host === "web.push.apple.com" || host.endsWith(".push.apple.com")) return true;
  if (host.endsWith(".notify.windows.com")) return true;
  if (host.endsWith(".wns.windows.com")) return true;
  return false;
}

export function normalizeWebPushEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 5000) throw new Error("Invalid Web Push endpoint.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid Web Push endpoint.");
  }

  if (url.protocol !== "https:") throw new Error("Web Push endpoint must use HTTPS.");
  if (url.username || url.password) throw new Error("Web Push endpoint cannot contain userinfo.");
  if (url.port && url.port !== "443") throw new Error("Web Push endpoint must use the default HTTPS port.");
  if (url.hash) throw new Error("Web Push endpoint cannot contain a fragment.");
  if (isIpLiteralHostname(url.hostname)) throw new Error("Web Push endpoint cannot use an IP literal.");
  if (!isRecognizedWebPushHost(url.hostname)) {
    throw new Error("Web Push endpoint host is not a recognized push service.");
  }

  return url.href;
}

export function validWebPushEndpoint(value) {
  try {
    return normalizeWebPushEndpoint(value);
  } catch {
    return "";
  }
}
