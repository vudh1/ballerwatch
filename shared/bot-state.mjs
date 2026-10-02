/**
 * Loads and stores BallerWatch user/runtime settings behind one AES-GCM envelope.
 *
 * Documentation baseline: v5.8.0. Legacy nested-encryption files remain readable
 * during migration, but every new write encrypts the complete runtime document.
 */
import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "./state-crypto.mjs";

const STATE_PATH = "state/listener.json";

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
    webPairCodeHash: "",
    webPairExpiresAt: "",
    recentBotReplies: [],
  };
}

export function loadBotState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    const current = decryptState(raw);
    if (current && typeof current === "object") {
      return {
        lastUpdateId: Number(current.lastUpdateId || 0),
        settings: current.settings && typeof current.settings === "object"
          ? { ...defaults(), ...current.settings }
          : defaults(),
      };
    }

    // v5.7 and older exposed lastUpdateId while encrypting only settings.
    // Keep this read path solely so a production migration can re-seal the
    // complete document without losing an in-flight update cursor.
    return {
      lastUpdateId: Number(raw.lastUpdateId || 0),
      settings: { ...defaults(), ...(decryptState(raw.settings) || {}) },
    };
  } catch {
    return { lastUpdateId: 0, settings: defaults() };
  }
}

export function saveBotState(lastUpdateId, settings) {
  const current = loadBotState();
  const nextId = Number(lastUpdateId || 0);
  if (
    current.lastUpdateId === nextId &&
    JSON.stringify(current.settings) === JSON.stringify(settings)
  ) {
    return false;
  }

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      encryptState({ lastUpdateId: nextId, settings }),
      null,
      2,
    ) + "\n",
  );
  return true;
}

export function loadBotSettings() {
  return loadBotState().settings;
}
