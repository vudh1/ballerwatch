import { isPublicRequestSummary } from "./shared/feature-requests.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const FORBIDDEN_TRACKED = new Set([
  ".clasp.json",
  ".clasprc.json",
  "league/teams.json",
  "league/schedule.json",
  "league/today.json",
  "league/calendar-snapshot.json",
  "league/calendar-changes.json",
  "league/telegram-update.json",
  "league/score-changes.json",
]);

const ENCRYPTED_PREFIXES = [
  "pickup/state/",
  "league/state/",
];

const ENCRYPTED_EXACT = new Set([
  "requests/private.json",
]);

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isEncryptedEnvelope(value) {
  return Boolean(
    value &&
      value.v === 1 &&
      typeof value.iv === "string" &&
      value.iv.length >= 12 &&
      typeof value.tag === "string" &&
      value.tag.length >= 12 &&
      typeof value.data === "string" &&
      value.data.length > 0,
  );
}

function fail(message) {
  console.error(`PRIVACY FAILURE: ${message}`);
  process.exitCode = 1;
}

const files = trackedFiles();

for (const file of files) {
  if (file === ".runtime" || file.startsWith(".runtime/")) {
    fail(`runtime plaintext path is tracked: ${file}`);
  }
  if (file === "pickup/data" || file.startsWith("pickup/data/")) {
    fail(`legacy pickup plaintext path is tracked: ${file}`);
  }
  if (FORBIDDEN_TRACKED.has(file)) {
    fail(`league plaintext/runtime file is tracked: ${file}`);
  }

  const mustBeEncrypted =
    ENCRYPTED_EXACT.has(file) ||
    ENCRYPTED_PREFIXES.some((prefix) => file.startsWith(prefix));

  if (mustBeEncrypted && !isEncryptedEnvelope(readJson(file))) {
    fail(`protected state is not an encrypted AES-GCM envelope: ${file}`);
  }
}

const listener = readJson("state/listener.json");
if (listener?.settings && !isEncryptedEnvelope(listener.settings)) {
  fail("state/listener.json settings are not encrypted");
}

const unknown = readJson("requests/unknown.json");
if (!isPublicRequestSummary(unknown)) {
  fail("requests/unknown.json must contain only version 3 fixed categories, counts, and feedback counters");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Privacy audit passed: no tracked plaintext protected state.");
