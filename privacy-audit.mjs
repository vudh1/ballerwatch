/**
 * Fails CI when public Git history contains forbidden runtime, credential, or private-data paths.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
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
  "league/status.json",
  "requests/private.json",
  "requests/unknown.json",
]);

const RUNTIME_PREFIXES = [
  "pickup/state/",
  "league/state/",
  "state/",
];

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
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
    fail(`runtime/private file is tracked: ${file}`);
  }
  if (RUNTIME_PREFIXES.some(prefix => file.startsWith(prefix))) {
    fail(`runtime-state path is tracked on main: ${file}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Privacy audit passed: main contains code/config/history only; runtime state is not tracked on main.");
