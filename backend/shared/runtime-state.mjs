/**
 * Transfers encrypted runtime files between GitHub Actions and the dedicated runtime-state branch.
 *
 * Documentation baseline: v2.4.0. The runtime-state branch is durable storage; main stays release-only.
 * v2.5.0: missing files on a readable branch are authoritative after purge, never cache misses.
 * v2.5.4: each write replaces branch history with one root snapshot commit.
 * v2.5.5: root snapshots contain only canonical runtime paths; source files are never carried into runtime-state.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { restoreFailoverState } from "./failover-state.mjs";
import { ALL_RUNTIME_FILE_PATHS, runtimePathsFor } from "./runtime-paths.mjs";
import {
  decryptState,
  encryptState,
  isEncryptedStateEnvelope,
  isHardenedStateEnvelope,
} from "./state-crypto.mjs";

const STATE_BRANCH = String(process.env.BALLERWATCH_STATE_BRANCH || "runtime-state").trim();
export const RUNTIME_GIT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: RUNTIME_GIT_MAX_BUFFER_BYTES,
    ...options,
  });
}

function blobSha(raw) {
  const body = Buffer.from(String(raw), "utf8");
  return crypto
    .createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
    .digest("hex");
}

function baselinePath(scope) {
  return path.join(".runtime", "state-baseline", `${scope}.json`);
}

function saveBaseline(scope, baseline) {
  const file = baselinePath(scope);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + "\n");
}

function loadBaseline(scope) {
  try {
    return JSON.parse(fs.readFileSync(baselinePath(scope), "utf8"));
  } catch {
    return {};
  }
}

function fetchStateBranch() {
  git(["fetch", "--quiet", "--depth=1", "origin", STATE_BRANCH]);
}

function readBranchFile(file) {
  try {
    return git(["show", `FETCH_HEAD:${file}`]);
  } catch {
    return null;
  }
}

function parseRuntimeJson(file, raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Runtime-state file is not valid JSON: ${file}`);
  }
}

function legacyRuntimeValue(file, parsed) {
  if (file === "state/user.json" && parsed?.settings) {
    const settings = decryptState(parsed.settings);
    if (!settings || typeof settings !== "object") {
      throw new Error("Unable to decrypt legacy web user settings during migration.");
    }
    return {
      lastUpdateId: Number(parsed.lastUpdateId || 0),
      settings,
    };
  }
  return parsed;
}

function sealLocalRuntimeFile(file) {
  if (!fs.existsSync(file)) return false;
  const raw = fs.readFileSync(file, "utf8");
  const parsed = parseRuntimeJson(file, raw);
  if (isHardenedStateEnvelope(parsed)) return false;

  const value = isEncryptedStateEnvelope(parsed)
    ? decryptState(parsed)
    : legacyRuntimeValue(file, parsed);
  if (!value || typeof value !== "object") {
    throw new Error(`Unable to decrypt runtime-state file during key migration: ${file}`);
  }

  const sealed = encryptState(value);
  fs.writeFileSync(file, JSON.stringify(sealed, null, 2) + "\n");
  console.log(`Resealed ${file} with the domain-separated runtime encryption key.`);
  return true;
}

export function auditRuntimeStateBranch() {
  fetchStateBranch();
  const canonical = new Set(ALL_RUNTIME_FILE_PATHS);
  const branchFiles = git([
    "ls-tree",
    "-r",
    "--name-only",
    "FETCH_HEAD",
  ])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  const failures = [];
  for (const file of branchFiles) {
    // Unknown files are a privacy failure too: the snapshot branch is allowed
    // to contain only the reviewed canonical runtime paths.
    if (!canonical.has(file)) {
      if (file === "state/listener.json") {
        const legacyRaw = readBranchFile(file);
        try {
          if (!legacyRaw || !isHardenedStateEnvelope(parseRuntimeJson(file, legacyRaw))) {
            failures.push(file);
          }
        } catch {
          failures.push(file);
        }
        continue;
      }
      failures.push(file);
      continue;
    }
    const raw = readBranchFile(file);
    try {
      if (!raw || !isHardenedStateEnvelope(parseRuntimeJson(file, raw))) {
        failures.push(file);
      }
    } catch {
      failures.push(file);
    }
  }

  if (failures.length) {
    throw new Error(
      `Runtime-state encryption audit failed for: ${failures.join(", ")}`,
    );
  }
  console.log(
    `Runtime-state encryption audit passed for ${branchFiles.length} file(s).`,
  );
  return branchFiles.length;
}

export async function pullRuntimeState(scope) {
  const files = runtimePathsFor(scope);
  const baseline = {};
  let count = 0;
  let branchAvailable = false;
  try {
    fetchStateBranch();
    branchAvailable = true;
  } catch {}

  if (branchAvailable) {
    // A successful branch read is authoritative, including absent files after
    // PURGE. Recovery caches must never resurrect intentionally deleted state.
    for (const file of files) {
      let raw = readBranchFile(file);
      let migratedLegacyUserState = false;
      if (
        file === "state/user.json" &&
        (typeof raw !== "string" || !raw)
      ) {
        raw = readBranchFile("state/listener.json");
        migratedLegacyUserState = typeof raw === "string" && Boolean(raw);
      }
      if (typeof raw !== "string" || !raw) {
        fs.rmSync(file, { force: true });
        continue;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const normalized = raw.endsWith("\n") ? raw : raw + "\n";
      fs.writeFileSync(file, normalized);
      if (!migratedLegacyUserState) baseline[file] = blobSha(normalized);
      sealLocalRuntimeFile(file);
      if (migratedLegacyUserState) {
        console.log("Migrated encrypted legacy user state to state/user.json.");
      }
      count += 1;
    }
  } else {
    // Recovery applies only when the branch itself cannot be fetched.
    count = restoreFailoverState(scope);
    if (!count) throw new Error("Runtime-state branch unavailable and no encrypted backup exists.");
    for (const file of files) sealLocalRuntimeFile(file);
    console.warn(`Used encrypted ${scope} Actions-cache backup while runtime-state is unavailable.`);
  }

  saveBaseline(scope, baseline);
  console.log(`Pulled ${count}/${files.length} ${scope} runtime-state file(s) from GitHub runtime storage.`);
  return count;
}

function changedLocalFiles(scope) {
  const baseline = loadBaseline(scope);
  const changed = [];
  for (const file of runtimePathsFor(scope)) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseRuntimeJson(file, raw);
    if (!isHardenedStateEnvelope(parsed)) {
      throw new Error(`Refusing to persist runtime-state without the hardened encryption KDF: ${file}`);
    }
    if (blobSha(raw) !== String(baseline[file] || "")) changed.push({ file, raw });
  }
  return changed;
}

function removeWorktree(directory) {
  try { git(["worktree", "remove", "--force", directory]); } catch {}
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
}

export function snapshotPushArgs(branch, expectedHead, commit) {
  return [
    "push",
    "--quiet",
    `--force-with-lease=refs/heads/${branch}:${expectedHead}`,
    "origin",
    `${commit}:refs/heads/${branch}`,
  ];
}

function createRootSnapshotCommit(directory, message) {
  const tree = git(["-C", directory, "write-tree"]).trim();
  return git(["-C", directory, "commit-tree", tree, "-m", message]).trim();
}

function stageCanonicalRuntimeTree(directory) {
  git(["-C", directory, "read-tree", "--empty"]);
  const existing = ALL_RUNTIME_FILE_PATHS.filter((file) =>
    fs.existsSync(path.join(directory, file)),
  );
  if (existing.length) {
    git(["-C", directory, "add", "-f", "--", ...existing]);
  }
  return existing;
}

function pushRootSnapshot(directory, expectedHead, message) {
  stageCanonicalRuntimeTree(directory);
  const commit = createRootSnapshotCommit(directory, message);
  git(["-C", directory, ...snapshotPushArgs(STATE_BRANCH, expectedHead, commit)]);
  return commit;
}

function pushChangedFiles(scope, changed) {
  const directory = path.join(".runtime", `state-worktree-${scope}`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    removeWorktree(directory);
    fetchStateBranch();
    const expectedHead = git(["rev-parse", "FETCH_HEAD"]).trim();
    git(["worktree", "add", "--quiet", "--detach", directory, "FETCH_HEAD"]);
    try {
      git(["-C", directory, "config", "user.name", "BallerWatch Runtime"]);
      git(["-C", directory, "config", "user.email", "actions@users.noreply.github.com"]);

      for (const { file, raw } of changed) {
        const target = path.join(directory, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, raw);
      }
      try {
        pushRootSnapshot(directory, expectedHead, `runtime(${scope}): current encrypted state`);
        console.log(
          `Pushed ${changed.length} changed ${scope} runtime file(s) and compacted ${STATE_BRANCH} to one snapshot commit.`,
        );
        return changed.length;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    } finally {
      removeWorktree(directory);
    }
  }
  return 0;
}

export async function pushRuntimeState(scope) {
  const changed = changedLocalFiles(scope);
  if (!changed.length) {
    console.log(`No ${scope} runtime-state changes to persist.`);
    return 0;
  }
  try {
    return pushChangedFiles(scope, changed);
  } catch (error) {
    if (String(process.env.BALLERWATCH_ALLOW_OFFLINE || "").toLowerCase() === "true") {
      console.warn("GitHub runtime-state write unavailable; encrypted Actions-cache backup remains available.");
      return 0;
    }
    throw error;
  }
}

export function purgeRuntimeState() {
  const directory = path.join(".runtime", "state-worktree-purge");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    removeWorktree(directory);
    fetchStateBranch();
    const expectedHead = git(["rev-parse", "FETCH_HEAD"]).trim();
    git(["worktree", "add", "--quiet", "--detach", directory, "FETCH_HEAD"]);
    try {
      git(["-C", directory, "config", "user.name", "BallerWatch Runtime"]);
      git(["-C", directory, "config", "user.email", "actions@users.noreply.github.com"]);
      let removed = 0;
      for (const file of ALL_RUNTIME_FILE_PATHS) {
        const target = path.join(directory, file);
        if (!fs.existsSync(target)) continue;
        fs.rmSync(target, { force: true });
        removed += 1;
      }
      try {
        pushRootSnapshot(directory, expectedHead, "runtime: purged factory-reset snapshot");
        console.log(
          `Purged ${removed} runtime file(s) and compacted ${STATE_BRANCH} to one root commit.`,
        );
        return removed;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    } finally {
      removeWorktree(directory);
    }
  }
  return 0;
}

export function cleanRuntimeState(scope) {
  let count = 0;
  for (const file of runtimePathsFor(scope)) {
    try {
      fs.rmSync(file, { force: true });
      count += 1;
    } catch {}
  }
  try { fs.rmSync(baselinePath(scope), { force: true }); } catch {}
  for (const dir of ["pickup/state", "league/state", "state", "requests"]) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {}
  }
  console.log(`Cleaned ${count} local ${scope} runtime-state path(s).`);
}

const command = process.argv[2];
const scope = process.argv[3];
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (command === "pull") await pullRuntimeState(scope);
  else if (command === "push") await pushRuntimeState(scope);
  else if (command === "purge") purgeRuntimeState();
  else if (command === "clean") cleanRuntimeState(scope);
  else if (command === "audit") auditRuntimeStateBranch();
  else throw new Error(
    "Usage: node backend/shared/runtime-state.mjs pull|push|clean <scope> | purge | audit",
  );
}
