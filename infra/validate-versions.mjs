/**
 * Validates the SemVer product-release ledger used by CI.
 *
 * Documentation baseline: v5.8.0. User-facing release announcements live
 * inline with their release entry; maintenance commits do not create versions.
 */
import fs from "node:fs";

function fail(message) {
  console.error(`VERSION FAILURE: ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot parse ${path}: ${error.message}`);
    return null;
  }
}

function parseSemver(value) {
  const match = String(value || "").match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  return match ? match.slice(1).map(Number) : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

const ledger = readJson("features/versions.json");
if (!ledger) process.exit(1);

if (ledger.schemaVersion !== 1) fail("features/versions.json schemaVersion must be 1");
const releases = Array.isArray(ledger.releases) ? ledger.releases : [];
if (!releases.length) fail("release ledger must contain at least one release");

const known = new Set();
let previous = null;
for (const release of releases) {
  const parsed = parseSemver(release.version);
  if (!parsed) {
    fail(`invalid SemVer: ${release.version}`);
    continue;
  }
  if (known.has(release.version)) fail(`duplicate version: ${release.version}`);
  known.add(release.version);
  if (previous && compare(previous, parsed) <= 0) {
    fail("releases must be ordered newest to oldest");
  }
  previous = parsed;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(release.date || ""))) {
    fail(`invalid release date for ${release.version}`);
  }
  if (!["major", "minor", "patch"].includes(release.type)) {
    fail(`invalid release type for ${release.version}`);
  }
  if (!String(release.title || "").trim()) fail(`missing title for ${release.version}`);
  if (!Array.isArray(release.changes) || !release.changes.length) {
    fail(`missing change list for ${release.version}`);
  }
}

if (releases[0]?.version !== ledger.currentVersion) {
  fail("currentVersion must equal the newest release");
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Version history valid: BallerWatch v${ledger.currentVersion} (${releases.length} releases).`);
