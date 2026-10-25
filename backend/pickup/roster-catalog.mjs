/**
 * Monthly, name-only directory snapshot from the publicly published RSVP
 * Google Apps Script roster. The source itself is dynamic, not a static list
 * in nhcuong95/rsvp. v11.10.0.
 *
 * Deliberately drops all contact, payment, note and RSVP metadata before
 * sealing the directory with TRACKER_STATE_KEY. Never publishes a global
 * participant directory to the PWA or Worker API, or logs individual names.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { discoverPublicRsvpEndpoint } from "./upstream-endpoint.mjs";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";

export const RSVP_ROSTER_CATALOG_PATH = "pickup/state/roster-catalog.json";
const CALLBACK = "ballerwatchMonthlyRoster";
const MAX_RESPONSE_BYTES = 512_000;
const MAX_ROSTER_NAMES = 2000;

export function rosterNamesOnly(members) {
  if (!Array.isArray(members) || !members.length || members.length > MAX_ROSTER_NAMES) {
    throw new Error("RSVP public roster is empty or unexpectedly large");
  }
  const unique = new Map();
  for (const member of members) {
    if (typeof member?.name !== "string") continue;
    const name = member.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) continue;
    unique.set(name.toLocaleLowerCase("en"), name);
  }
  const names = [...unique.values()].sort((a, b) => a.localeCompare(b));
  if (!names.length) throw new Error("RSVP public roster has no valid names");
  return names;
}

export function parsePublicRosterResponse(body, callback = CALLBACK) {
  if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("RSVP roster response exceeds the safe size limit");
  }
  const trimmed = body.trim();
  const prefix = callback + "(";
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(");")) {
    throw new Error("RSVP public roster response is not expected JSONP");
  }
  const payload = JSON.parse(trimmed.slice(prefix.length, -2));
  if (payload?.ok !== true) throw new Error("RSVP public roster request was unsuccessful");
  return rosterNamesOnly(payload.roster);
}

export function privateRosterCatalog(names, updatedAt = new Date()) {
  if (!Array.isArray(names) || !names.length || !Number.isFinite(updatedAt.getTime())) {
    throw new Error("Cannot build empty or undated private RSVP catalog");
  }
  return { schema: 1, source: "nhcuong95/rsvp:public-listRoster:name-only",
    refreshedAt: updatedAt.toISOString(), names: rosterNamesOnly(names.map(name => ({ name }))) };
}

export async function fetchPublicRosterNames({
  fetchImpl = fetch,
  discoverEndpoint = discoverPublicRsvpEndpoint,
} = {}) {
  const endpoint = await discoverEndpoint({ fetchImpl });
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.pathname) ||
      parsed.username || parsed.password) {
    throw new Error("RSVP roster source is not an approved public Apps Script URL");
  }
  parsed.search = "";
  parsed.searchParams.set("action", "listRoster");
  parsed.searchParams.set("callback", CALLBACK);
  const response = await fetchImpl(parsed.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(18_000),
    headers: { "user-agent": "ballerwatch-public-roster-monthly/1.0" },
  });
  if (!response.ok) throw new Error("RSVP public roster fetch failed (HTTP " + response.status + ")");
  const raw = await response.text();
  return parsePublicRosterResponse(raw);
}

export async function refreshEncryptedRosterCatalog({
  fetchNames = fetchPublicRosterNames, now = new Date(), file = RSVP_ROSTER_CATALOG_PATH,
} = {}) {
  const names = await fetchNames();
  const catalog = privateRosterCatalog(names, now);
  // Fail before touching the canonical file when encryption is not configured.
  const hardened = encryptState(catalog);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  try {
    fs.writeFileSync(temp, JSON.stringify(hardened) + "\n", { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
  return { memberCount: catalog.names.length, refreshedAt: catalog.refreshedAt };
}

export function readEncryptedRosterCatalog(file = RSVP_ROSTER_CATALOG_PATH) {
  try {
    const snapshot = decryptState(JSON.parse(fs.readFileSync(file, "utf8")));
    return snapshot?.schema === 1 && Array.isArray(snapshot.names) ? snapshot : null;
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const refreshed = await refreshEncryptedRosterCatalog();
  console.log("Encrypted monthly RSVP directory refreshed; name count:",
    refreshed.memberCount, "(no names or contact details logged).");
}
