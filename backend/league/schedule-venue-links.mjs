/**
 * Reads RATS Schedule & Standings field links and preserves its observed
 * Google Maps query URL format. No inferred GPS coordinates or foreign URLs.
 */
import { matchVenue, validRatsVenueUrl, venueNameParts } from "../shared/venue-directory.mjs";

export const RATS_SCHEDULE_PAGE = "https://seattlerats.org/schedule--standings";
const MAX_BYTES = 500_000;

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readableText(value) {
  return htmlDecode(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// RATS's published field link is a Google Maps name query, not a GPS pin.
// Mirror this exact URL shape when its JavaScript-only page exposes no href.
export function ratsScheduleFieldSearchUrl(name) {
  const field = String(name || "").trim().replace(/\s+/g, " ");
  if (!venueNameParts(field).core || field.length > 150) return "";
  return "https://www.google.com/maps?" + new URLSearchParams({q:field}).toString();
}

function mapLinkForField(value, label, requested) {
  const raw = htmlDecode(value);
  const valid = validRatsVenueUrl(raw);
  if (!valid) return "";
  const url = new URL(valid);
  if (!["google.com","www.google.com","maps.google.com"].includes(url.hostname) ||
    url.pathname !== "/maps") return "";
  const q = url.searchParams.get("q") || "";
  const candidate = q || label;
  if (!candidate) return "";
  const matching = matchVenue({venues:[{name:candidate}]}, requested);
  // When the map query itself identifies a different field subdivision,
  // never borrow this link based only on a nearby label.
  if (!matching || (q && !matchVenue({venues:[{name:q}]}, requested))) return "";
  return valid;
}

export function extractPublishedRatsScheduleLinks(html, fieldNames = []) {
  const markup = String(html || "").slice(0, MAX_BYTES);
  const requested = [...new Set(fieldNames.map(name => String(name || "").trim()).filter(Boolean))];
  const candidates = new Map(requested.map(name => [name, new Set()]));

  // Covers server-rendered anchors and links embedded in JSON/script data.
  const normalizedMarkup = markup.replace(/\\\//g, "/");
  const rawUrls = [...normalizedMarkup.matchAll(/https?:\/\/(?:www\.)?google\.com\/maps\?q=[^\s<>"']+/gi)]
    .map(item => htmlDecode(item[0]));
  const anchors = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(item => {
    const href = item[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    return {url:htmlDecode(href?.[1] || href?.[2] || ""), label:readableText(item[2])};
  });
  for (const name of requested) {
    for (const link of anchors) {
      const url = mapLinkForField(link.url, link.label, name);
      if (url) candidates.get(name).add(url);
    }
    for (const raw of rawUrls) {
      const url = mapLinkForField(raw, "", name);
      if (url) candidates.get(name).add(url);
    }
  }
  return requested.flatMap(name => {
    const urls = [...candidates.get(name)];
    // Two distinct links for an apparently identical field are ambiguous.
    return urls.length === 1 ? [{name, mapUrl:urls[0]}] : [];
  });
}

export async function discoverRatsScheduleLinks(fieldNames, {
  fetchImpl = globalThis.fetch, timeoutMs = 6500,
} = {}) {
  if (!fieldNames.length) return [];
  try {
    const response = await fetchImpl(RATS_SCHEDULE_PAGE, {
      method:"GET",
      redirect:"error",
      headers:{Accept:"text/html", "User-Agent":"BallerWatch-RATS-venues/1.0"},
      signal:AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];
    const contentType = response.headers?.get?.("content-type") || "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) return [];
    const html = await response.text();
    if (html.length > MAX_BYTES) return [];
    return extractPublishedRatsScheduleLinks(html, fieldNames);
  } catch {
    // RATS renders its schedule through JavaScript on some responses.
    // Do not fail the watcher or treat unavailable markup as verified data.
    return [];
  }
}
