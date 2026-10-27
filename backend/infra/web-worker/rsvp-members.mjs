/**
 * Names-only selection from the public RSVP member directory.
 * No payment, Messenger, contact, RSVP or billing fields enter this projection.
 * The encrypted monthly canonical snapshot remains authoritative; until its
 * first successful refresh a bounded public Apps Script read is permitted.
 */
const PUBLIC_SOURCE = "https://raw.githubusercontent.com/nhcuong95/rsvp/main/app.js";
const CALLBACK = "ballerwatchMembers";
const MAX_BYTES = 512000;

export function publicMemberNames(members) {
  if (!Array.isArray(members) || members.length < 1 || members.length > 2000) {
    throw new Error("RSVP membership list is empty or out of bounds.");
  }
  const unique = new Map();
  for (const member of members) {
    const raw = typeof member === "string" ? member : member?.name;
    if (typeof raw !== "string" || /[\x00-\x1f\x7f]/.test(raw)) continue;
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) continue;
    unique.set(name.toLocaleLowerCase("en"), name);
  }
  if (!unique.size) throw new Error("RSVP membership has no valid names.");
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

export function namesFromEncryptedCatalog(catalog, now = new Date()) {
  const at = Date.parse(catalog?.refreshedAt || "");
  if (catalog?.schema !== 1 || !Array.isArray(catalog.names) ||
      !Number.isFinite(at) || at > now.getTime() + 60000 ||
      now.getTime() - at > 45 * 86400000) {
    throw new Error("Monthly RSVP catalog unavailable or stale.");
  }
  return publicMemberNames(catalog.names);
}

export function parsePublicMembersJsonp(text, callback = CALLBACK) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new Error("RSVP membership response exceeds size limit.");
  }
  const payload = text.trim();
  if (!payload.startsWith(callback + "(") || !payload.endsWith(");")) {
    throw new Error("Unexpected RSVP membership response.");
  }
  const data = JSON.parse(payload.slice(callback.length + 1, -2));
  if (data?.ok !== true) throw new Error("RSVP membership source unavailable.");
  return publicMemberNames(data.roster);
}

export function approvedPublicAppsScript(source) {
  const match = String(source || "").match(
    /const APPS_SCRIPT_URL\s*=\s*["'](https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec)["']/,
  );
  if (!match) throw new Error("Public RSVP source endpoint missing.");
  const url = new URL(match[1]);
  if (url.hostname !== "script.google.com" || url.protocol !== "https:" ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("Unexpected public RSVP endpoint.");
  }
  url.searchParams.set("action", "listRoster");
  url.searchParams.set("callback", CALLBACK);
  return url.toString();
}

export async function livePublicMemberNames(fetchImpl = fetch) {
  // Executed only after the encrypted catalog is missing/stale. The caller
  // caches this names-only result in bounded Worker memory for 15 minutes.
  const source = await fetchImpl(PUBLIC_SOURCE, {
    signal: AbortSignal.timeout(4500),
    headers: { accept: "text/javascript" },
  });
  if (!source.ok) throw new Error("Unable to discover public RSVP source.");
  const script = await source.text();
  if (new TextEncoder().encode(script).length > 300000) {
    throw new Error("Public RSVP source too large.");
  }
  const response = await fetchImpl(approvedPublicAppsScript(script), {
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error("Unable to read public RSVP membership.");
  return parsePublicMembersJsonp(await response.text());
}
