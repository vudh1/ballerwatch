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
  };
}

export function loadBotState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return {
      lastUpdateId: Number(raw.lastUpdateId || 0),
      settings: decryptState(raw.settings) || defaults(),
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
      { lastUpdateId: nextId, settings: encryptState(settings) },
      null,
      2,
    ) + "\n",
  );
  return true;
}

export function loadBotSettings() {
  return loadBotState().settings;
}
