import { readDeviceLease, writeDeviceLease } from "./device-lease.js";
/** Anonymous per-device preferences. Never stores credentials or roster data. */
export const GUEST_PROFILE_KEY = "ballerwatch-visitor-profile-v1";
export const MAX_GUEST_TEAMS = 8;
const clean = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
export function normalizeGuestProfile(raw = {}) {
  const teams = [], seen = new Set();
  for (const candidate of Array.isArray(raw?.teams) ? raw.teams : []) {
    const name = clean(candidate), key = name.toLocaleLowerCase("en");
    if (!name || seen.has(key)) continue;
    seen.add(key); teams.push(name);
    if (teams.length >= MAX_GUEST_TEAMS) break;
  }
  return { name: clean(raw?.name), teams };
}
export function readGuestProfile(storage, now = Date.now()) {
  // Forget old unexpiring v1 preferences instead of silently retaining them.
  try { storage.removeItem(GUEST_PROFILE_KEY); } catch {}
  return normalizeGuestProfile(readDeviceLease(storage, GUEST_PROFILE_KEY + "-24h", now) || {});
}
export function saveGuestProfile(storage, profile, now = Date.now()) {
  return writeDeviceLease(storage, GUEST_PROFILE_KEY + "-24h",
    normalizeGuestProfile(profile), now);
}
