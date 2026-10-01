import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "./state-crypto.mjs";

const FILES = [
  "schedule.json",
  "today.json",
  "calendar-snapshot.json",
];

function statePath(name) {
  return path.join("league", "state", name);
}

function runtimePath(name) {
  return path.join("league", name);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function loadEncryptedLeagueState(name) {
  const encrypted = readJson(statePath(name));
  const decrypted = encrypted ? decryptState(encrypted) : null;
  if (decrypted) return decrypted;

  // One-time migration fallback from the old plaintext state.
  return readJson(runtimePath(name));
}

export function prepareLeagueRuntimeState() {
  for (const name of FILES) {
    const encrypted = readJson(statePath(name));
    if (!encrypted) continue;
    const payload = decryptState(encrypted);
    if (!payload) throw new Error(`Unable to decrypt league state: ${name}`);
    fs.writeFileSync(runtimePath(name), JSON.stringify(payload, null, 2) + "\n");
  }
}

export function sealLeagueRuntimeState() {
  fs.mkdirSync(path.join("league", "state"), { recursive: true });

  for (const name of FILES) {
    const file = runtimePath(name);
    const payload = readJson(file);
    if (payload) {
      const currentEncrypted = readJson(statePath(name));
      const current = currentEncrypted ? decryptState(currentEncrypted) : null;
      if (JSON.stringify(current) !== JSON.stringify(payload)) {
        fs.writeFileSync(
          statePath(name),
          JSON.stringify(encryptState(payload), null, 2) + "\n",
        );
      }
    }
    try {
      fs.unlinkSync(file);
    } catch {}
  }
}

if (process.argv[1] && process.argv[1].endsWith("league-state.mjs")) {
  const command = process.argv[2] || "";
  if (command === "prepare") {
    prepareLeagueRuntimeState();
    console.log("Prepared encrypted league runtime state.");
  } else if (command === "seal") {
    sealLeagueRuntimeState();
    console.log("Sealed league runtime state.");
  } else {
    throw new Error("Usage: node shared/league-state.mjs prepare|seal");
  }
}
