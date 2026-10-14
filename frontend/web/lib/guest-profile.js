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
export function readGuestProfile(storage) {
  try {
    const raw = storage.getItem(GUEST_PROFILE_KEY);
    return raw && raw.length < 2500 ? normalizeGuestProfile(JSON.parse(raw)) : normalizeGuestProfile();
  } catch { return normalizeGuestProfile(); }
}
export function saveGuestProfile(storage, profile) {
  try { storage.setItem(GUEST_PROFILE_KEY, JSON.stringify(normalizeGuestProfile(profile))); return true; }
  catch { return false; }
}
