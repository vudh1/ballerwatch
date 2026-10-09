/**
 * Best-effort discovery of a RATS-published venue page and its original map link.
 * Only the RATS origin is fetched, only newly encountered/unresolved fields are
 * examined, and unverified pages never become navigation destinations.
 */
import { matchVenue, validRatsVenueUrl } from "../shared/venue-directory.mjs";

const RATS_ORIGIN = "https://seattlerats.org";
const MAX_HTML_BYTES = 256_000;

function unescapeHtml(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
    const token = entity.toLowerCase();
    if (token[0] === "#") {
      const value = token[1] === "x" ? parseInt(token.slice(2), 16) : parseInt(token.slice(1), 10);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
    }
    return {amp:"&",quot:'"',apos:"'",lt:"<",gt:">"}[token] || "";
  });
}

function stripTags(value) {
  return unescapeHtml(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function safeMapUrl(value) {
  const url = validRatsVenueUrl(value);
  if (!url) return "";
  const parsed = new URL(url);
  return parsed.hostname !== "seattlerats.org" && parsed.hostname !== "www.seattlerats.org"
    ? url : "";
}

function isMatchingName(requestedName, publishedName) {
  if (!publishedName) return false;
  const cleaned = stripTags(publishedName).replace(/\s*[|–—-]\s*(?:Seattle\s+)?RATS(?:\s+FC)?\s*$/i, "")
    .replace(/\s*[|–—-]\s*Venue\s*$/i, "").trim();
  return Boolean(matchVenue({venues:[{name: cleaned}]}, requestedName));
}

export function ratsVenuePageUrl(name, publishedUrl = "") {
  const url = validRatsVenueUrl(publishedUrl);
  if (url) {
    const parsed = new URL(url);
    if (["seattlerats.org","www.seattlerats.org"].includes(parsed.hostname) &&
      /^\/venue\/[^/]+\/?$/.test(parsed.pathname)) return url;
  }
  const slug = String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 130);
  return slug.length >= 6 ? `${RATS_ORIGIN}/venue/${slug}/` : "";
}

export function readPublishedVenuePage(html, name, pageUrl) {
  const sourceUrl = validRatsVenueUrl(pageUrl);
  if (!sourceUrl || !/^https:\/\/(?:www\.)?seattlerats\.org\/venue\/[^/]+\/?$/.test(sourceUrl)) return null;
  const text = String(html || "").slice(0, MAX_HTML_BYTES);
  const headings = [...text.matchAll(/<(?:h1|h2|title)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|title)>/gi)]
    .map(match => stripTags(match[1]));
  const anchors = [...text.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(match => {
    const href = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    return {url:unescapeHtml(href?.[1] || href?.[2] || ""), label:stripTags(match[2])};
  });
  const hasMatchingHeading = headings.some(heading => isMatchingName(name, heading));
  const namedLinks = anchors.filter(anchor => isMatchingName(name, anchor.label) && safeMapUrl(anchor.url));
  const links = namedLinks.length ? namedLinks : hasMatchingHeading ? anchors : [];
  const mapUrls = [...new Set(links.map(item => safeMapUrl(item.url)).filter(Boolean))];
  // A different field's link must never be selected just because it shares a page.
  if (!hasMatchingHeading && !namedLinks.length) return null;
  if (mapUrls.length > 1) return null;
  return {sourceUrl, mapUrl:mapUrls[0] || ""};
}

export async function discoverPublishedRatsVenue(name, publishedUrl = "", {
  fetchImpl = globalThis.fetch,
  timeoutMs = 6500,
} = {}) {
  const known = validRatsVenueUrl(publishedUrl);
  const pageUrl = ratsVenuePageUrl(name, known);
  if (!pageUrl) return null;
  try {
    const response = await fetchImpl(pageUrl, {
      method: "GET",
      redirect: "error",
      headers: {Accept:"text/html", "User-Agent":"BallerWatch-RATS-venues/1.0"},
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const contentType = response.headers?.get?.("content-type") || "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) return null;
    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) return null;
    return readPublishedVenuePage(html, name, pageUrl);
  } catch {
    // Website timeouts/unavailable pages cannot interrupt the schedule watcher.
    return null;
  }
}
