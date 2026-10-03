/**
 * Loads and stores BallerWatch user/runtime settings behind one AES-GCM envelope.
 *
 * v6.0.0 stores only web/runtime user settings. Obsolete pre-web state fields
 * are stripped during migration and are never written back.
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
    webUsers: {},
  };
}

function cleanWebUsers(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const users = {};
  for (const [rawName, rawRecord] of Object.entries(source)) {
    const username = String(rawName || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(username) || username === "admin") continue;
    const record = rawRecord && typeof rawRecord === "object" ? rawRecord : {};
    const authVersion = Number(record.authVersion || 1);
    users[username] = {
      rsvpName: String(record.rsvpName || "").trim().slice(0, 120),
      webPassword: record.webPassword && typeof record.webPassword === "object"
        ? record.webPassword
        : null,
      authVersion: Number.isSafeInteger(authVersion) && authVersion >= 1 ? authVersion : 1,
      role: "user",
      createdAt: String(record.createdAt || ""),
    };
  }
  return users;
}

function cleanSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const next = { ...defaults(), ...source, webUsers: cleanWebUsers(source.webUsers) };
  delete next.webPairCodeHash;
  delete next.webPairExpiresAt;
  delete next.webPairConsumedAt;
  delete next.recentBotReplies;
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
