/** Persistent, anonymous preferences for this browser installation.
 * Only notifications use 24-hour leases. Keep RSVP name and monitored teams
 * until this device edits them, or the browser/user clears site storage.
 */
export const GUEST_PROFILE_KEY = "ballerwatch-visitor-profile-v1";
export const DEVICE_GUEST_PROFILE_KEY = "ballerwatch-visitor-profile-v2";
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

function validProfileBody(raw) {
  if (!raw || raw.length > 8_192) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.schema === 2 && parsed.data && typeof parsed.data === "object") {
      return parsed.data;
    }
    // Migrate v11.0.0's 24h wrapper, including if its timestamp has elapsed
    // but the old client has not erased the original browser record yet.
    if (parsed.schema === 1 && parsed.data && typeof parsed.data === "object") {
      return parsed.data;
    }
    if (parsed.name !== undefined || parsed.teams !== undefined) return parsed;
  } catch {}
  return null;
}

export function readGuestProfile(storage) {
  try {
    const current = validProfileBody(storage.getItem(DEVICE_GUEST_PROFILE_KEY));
    if (current) return normalizeGuestProfile(current);
    for (const legacy of [GUEST_PROFILE_KEY + "-24h", GUEST_PROFILE_KEY]) {
      const old = validProfileBody(storage.getItem(legacy));
      if (!old) continue;
      const normalized = normalizeGuestProfile(old);
      // Never discard the legacy copy until new persistent storage succeeds.
      if (saveGuestProfile(storage, normalized)) {
        storage.removeItem(legacy);
        storage.removeItem(GUEST_PROFILE_KEY);
      }
      return normalized;
    }
  } catch {}
  return normalizeGuestProfile({});
}

export function saveGuestProfile(storage, profile) {
  try {
    storage.setItem(DEVICE_GUEST_PROFILE_KEY, JSON.stringify({
      schema: 2, data: normalizeGuestProfile(profile),
    }));
    return true;
  } catch { return false; }
}
