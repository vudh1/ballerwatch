/**
 * Loads and stores BallerWatch user/runtime settings behind one AES-GCM envelope.
 *
 * v6.0.0 removes the legacy messaging listener while preserving the encrypted
 * state document path for migration compatibility. New writes contain only
 * web/runtime settings; obsolete listener cursors and pairing-code fields are dropped.
 */
import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "./state-crypto.mjs";

export const USER_STATE_PATH = "state/user.json";

function defaults() {
  return {
    mutedDates: [],
    snoozeUntil: "",
    snoozedDates: {},
    lastReferencedDate: "",
    ownerRsvpName: "",
    pickupEndpointOverride: "",
    pendingSetupField: "",
    lastSetupReminderAt: "",
    lastOwnerNameReminderAt: "",
    lastEndpointReminderAt: "",
    webOwnerPassword: null,
    webAuthVersion: 1,
  };
}

function cleanSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const next = { ...defaults(), ...source };
  delete next.webPairCodeHash;
  delete next.webPairExpiresAt;
  delete next.webPairConsumedAt;
  delete next.recentLegacyReplies;
  return next;
}

export function loadUserState() {
  try {
    const raw = JSON.parse(fs.readFileSync(USER_STATE_PATH, "utf8"));
    const current = decryptState(raw);
    if (current && typeof current === "object") {
      return {
        settings: cleanSettings(current.settings),
      };
    }

    // Compatibility with pre-v5.8 files that encrypted only the settings object.
    return {
      settings: cleanSettings(decryptState(raw.settings)),
    };
  } catch {
    return { settings: defaults() };
  }
}

export function saveUserState(settings) {
  const current = loadUserState().settings;
  const next = cleanSettings(settings);
  if (JSON.stringify(current) === JSON.stringify(next)) return false;

  fs.mkdirSync(path.dirname(USER_STATE_PATH), { recursive: true });
  fs.writeFileSync(
    USER_STATE_PATH,
    JSON.stringify(encryptState({ settings: next }), null, 2) + "\n",
  );
  return true;
}

export function loadUserSettings() {
  return loadUserState().settings;
}
