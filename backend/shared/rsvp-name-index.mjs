/** Private pickup participant membership, never a public name directory.
 * Stable HMAC digests permit per-device RSVP reminder suppression without
 * storing a guest's claimed plaintext name in push state or exposing rosters.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "./state-crypto.mjs";

export const RSVP_NAME_INDEX_PATH = "pickup/state/name-index.json";
const DOMAIN = "ballerwatch:rsvp-name:v1\0";
const TTL_MS = 24 * 60 * 60 * 1000;

export function nameTag(name, secret = process.env.TRACKER_STATE_KEY) {
  const normalized = String(name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  if (!normalized || !secret) return "";
  return crypto.createHmac("sha256", String(secret))
    .update(DOMAIN + normalized).digest("hex");
}

export function buildRsvpNameIndex(events, now = new Date(), secret = process.env.TRACKER_STATE_KEY) {
  if (!secret) throw new Error("RSVP name index requires encrypted-state signing key.");
  const dates = {};
  for (const [date, roster] of Object.entries(events || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const confirmed = [...new Set((roster?.players || [])
      .map(person => nameTag(person?.name, secret)).filter(Boolean))];
    const waitlisted = [...new Set((roster?.waitlist || [])
      .map(person => nameTag(person?.name, secret)).filter(Boolean))];
    dates[date] = { confirmed, waitlisted };
  }
  return { version: 1, updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(), dates };
}

export function loadRsvpNameIndex({now = new Date()} = {}) {
  try {
    const file = JSON.parse(fs.readFileSync(RSVP_NAME_INDEX_PATH, "utf8"));
    const value = decryptState(file);
    return value?.version === 1 && Date.parse(value.expiresAt || "") > now.getTime()
      ? value : null;
  } catch { return null; }
}

export function refreshRsvpNameIndex({now = new Date()} = {}) {
  const source = JSON.parse(fs.readFileSync("pickup/state/events.json", "utf8"));
  const privateSource = decryptState(source);
  if (!privateSource || !privateSource.events) {
    throw new Error("Private pickup source unavailable; refusing to overwrite RSVP name index.");
  }
  const current = buildRsvpNameIndex(privateSource.events, now);
  fs.mkdirSync(path.dirname(RSVP_NAME_INDEX_PATH), {recursive:true});
  fs.writeFileSync(RSVP_NAME_INDEX_PATH,
    JSON.stringify(encryptState(current), null, 2) + "\n");
  return current;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const current = refreshRsvpNameIndex();
  console.log("Prepared private RSVP name index for", Object.keys(current.dates).length,
    "pickup dates; no player names logged.");
}
