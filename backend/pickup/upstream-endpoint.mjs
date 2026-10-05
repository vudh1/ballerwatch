/**
 * Discovers the public RSVP data endpoint from the frontend source without persisting or logging it.
 *
 * Documentation baseline: v2.5.6. The configured secret/override remains primary; discovery is a
 * recovery path for missing or retired public Apps Script deployments.
 */
const FRONTEND_SOURCE_URL = "https://raw.githubusercontent.com/nhcuong95/rsvp/main/app.js";

export function extractPublicRsvpEndpoint(source) {
  const match = String(source || "").match(
    /\bconst\s+APPS_SCRIPT_URL\s*=\s*["'](https:\/\/[^"']+)["']/,
  );
  if (!match) return "";

  try {
    const url = new URL(match[1]);
    if (url.protocol !== "https:") return "";
    if (url.hostname !== "script.google.com") return "";
    if (!url.pathname.endsWith("/exec")) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export async function discoverPublicRsvpEndpoint({
  fetchImpl = fetch,
  sourceUrl = FRONTEND_SOURCE_URL,
  timeoutMs = 8000,
} = {}) {
  const response = await fetchImpl(sourceUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "ballerwatch-endpoint-discovery/1.0",
      "cache-control": "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`RSVP frontend discovery failed (HTTP ${response.status})`);
  }

  const endpoint = extractPublicRsvpEndpoint(await response.text());
  if (!endpoint) throw new Error("RSVP frontend did not expose a valid public endpoint");
  return endpoint;
}

export function shouldRediscoverEndpoint(error) {
  const status = Number(error?.status || 0);
  return status === 404 || status === 410;
}
