/**
 * Shared, non-sensitive device preference for switching between isolated Pages
 * installations. v11.2.0: navigation never rewrites a running PWA or auto-
 * redirects on boot, and a missing beta route fails back to production.
 */
export const CHANNEL_PREFERENCE_KEY = "ballerwatch:app-channel:v1";
const ROUTES = Object.freeze({
  production: "/ballerwatch/",
  beta: "/ballerwatch/beta/",
});
export function activeChannel(pathname = window.location.pathname) {
  return /^\/ballerwatch\/beta(?:\/|$)/.test(String(pathname)) ? "beta" : "production";
}
export function savedChannel(storage = window.localStorage) {
  try {
    const value = storage.getItem(CHANNEL_PREFERENCE_KEY);
    return value === "beta" ? "beta" : "production";
  } catch { return "production"; }
}
export function channelUrl(channel, origin = window.location.origin) {
  return new URL(ROUTES[channel === "beta" ? "beta" : "production"], origin).href;
}
function saveChannel(storage, channel) {
  try { storage.setItem(CHANNEL_PREFERENCE_KEY, channel); } catch { /* Optional device storage. */ }
}
export async function switchChannel(channel, {
  location = window.location,
  storage = window.localStorage,
  check = (url) => window.fetch(url, { method: "HEAD", cache: "no-store",
    signal: AbortSignal.timeout(3500) }),
} = {}) {
  const target = channel === "beta" ? "beta" : "production";
  const current = activeChannel(location.pathname);
  if (target === current) {
    saveChannel(storage, target);
    return { channel: current, navigated: false };
  }
  const url = channelUrl(target, location.origin);
  if (target === "beta") {
    try {
      const response = await check(url);
      if (!response?.ok) throw new Error("Beta route unavailable");
    } catch {
      saveChannel(storage, "production");
      return { channel: "production", navigated: false, unavailable: true };
    }
  }
  saveChannel(storage, target);
  location.assign(url);
  return { channel: target, navigated: true };
}
