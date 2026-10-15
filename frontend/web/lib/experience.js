/**
 * Canonical app preferences retain original root keys after the V2 promotion.
 * Baseline: v9.0.0. Copy a retired V2 preference only when the original key is
 * absent; never replace account state or erase either experience's data.
 */
// Older cached controllers still import this named export during an update.
export const isV2 = /\/v2(?:\/|$)/.test(window.location.pathname);

export function experienceKey(legacyKey, name) {
  for (const type of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[type];
      const oldValue = storage.getItem(`ballerwatch:v2:${name}`);
      if (oldValue !== null && storage.getItem(legacyKey) === null) storage.setItem(legacyKey, oldValue);
    } catch { /* Private browsing/storage failures must not block the app. */ }
  }
  return legacyKey;
}
