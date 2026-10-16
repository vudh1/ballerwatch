/** Accountless device preferences expire 24h after the last explicit change.
 * Browser storage cannot wake up to delete itself while the site is closed.
 * Expired records are actively removed the next time they are accessed.
 * Public fixture/scouting caches contain no personal data and remain separate.
 */
export const DEVICE_LEASE_MS = 24 * 60 * 60 * 1000;

export function readDeviceLease(storage, key, now = Date.now()) {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 8_192) {
      if (raw) storage.removeItem(key);
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.schema !== 1 || !Number.isSafeInteger(parsed.expiresAt) ||
        parsed.expiresAt <= now || parsed.expiresAt > now + DEVICE_LEASE_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data && typeof parsed.data === "object" ? parsed.data : null;
  } catch {
    try { storage.removeItem(key); } catch {}
    return null;
  }
}

export function writeDeviceLease(storage, key, data, now = Date.now()) {
  try {
    storage.setItem(key, JSON.stringify({
      schema: 1, expiresAt: now + DEVICE_LEASE_MS, data,
    }));
    return true;
  } catch { return false; }
}
