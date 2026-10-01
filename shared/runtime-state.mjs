/**
 * Transfers encrypted runtime files between GitHub Actions and the dedicated runtime-state branch.
 *
 * Documentation baseline: v2.4.0. The runtime-state branch is durable storage; main stays release-only.
 * A one-time legacy Cloudflare read fallback is retained so existing KV state can migrate safely.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { restoreFailoverState } from "./failover-state.mjs";
import { ALL_RUNTIME_FILE_PATHS, runtimePathsFor } from "./runtime-paths.mjs";

const STATE_BRANCH = String(process.env.BALLERWATCH_STATE_BRANCH || "runtime-state").trim();
const DEFAULT_URL = "https://ballerwatch-telegram.vudhone.workers.dev";

function clean(value) {
  return String(value || "").trim();
}

function runtimeUrl() {
  return clean(process.env.BALLERWATCH_RUNTIME_URL || DEFAULT_URL).replace(/\/$/, "");
}

function adminSecret() {
  const token = clean(process.env.TELEGRAM_BOT_TOKEN);
  const chat = clean(process.env.TELEGRAM_CHAT_ID);
  if (!token || !chat) throw new Error("Telegram credentials are unavailable for legacy migration.");
  return crypto
    .createHash("sha256")
    .update(`${token}|${chat}|ballerwatch-webhook-v1`)
    .digest("hex");
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

async function legacyCloudflareGet(paths) {
  if (!paths.length) return {};
  const response = await fetch(`${runtimeUrl()}/admin/runtime-files`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "content-type": "application/json",
      "x-ballerwatch-admin": adminSecret(),
    },
    body: JSON.stringify({ action: "get", paths }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`Legacy Cloudflare migration read failed (${response.status}).`);
  }
  return payload.files || {};
}

export async function pullRuntimeState(scope) {
  const files = runtimePathsFor(scope);
  const baseline = {};
  const missing = [];
  let count = 0;

  try {
    fetchStateBranch();
    for (const file of files) {
      const raw = readBranchFile(file);
      if (typeof raw !== "string" || !raw) {
        missing.push(file);
        continue;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, raw.endsWith("\n") ? raw : raw + "\n");
      baseline[file] = blobSha(raw.endsWith("\n") ? raw : raw + "\n");
      count += 1;
    }
  } catch {
    missing.push(...files);
  }

  const uniqueMissing = [...new Set(missing)].filter((file) => !baseline[file]);
  if (uniqueMissing.length) {
    try {
      const legacy = await legacyCloudflareGet(uniqueMissing);
      for (const file of uniqueMissing) {
        const raw = legacy?.[file];
        if (typeof raw !== "string" || !raw) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, raw.endsWith("\n") ? raw : raw + "\n");
        baseline[file] = "";
        count += 1;
      }
      if (Object.keys(legacy).length) {
        console.log(`Recovered ${Object.keys(legacy).length} missing runtime file(s) from legacy Cloudflare KV for migration.`);
      }
    } catch (error) {
      const restored = restoreFailoverState(scope);
      if (!count && !restored) throw error;
      if (restored) console.warn(`Used encrypted ${scope} Actions-cache backup for missing runtime state.`);
    }
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
    if (blobSha(raw) !== String(baseline[file] || "")) changed.push({ file, raw });
  }
  return changed;
}

function removeWorktree(directory) {
  try { git(["worktree", "remove", "--force", directory]); } catch {}
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
}

function pushChangedFiles(scope, changed) {
  const directory = path.join(".runtime", `state-worktree-${scope}`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    removeWorktree(directory);
    fetchStateBranch();
    git(["worktree", "add", "--quiet", "--detach", directory, "FETCH_HEAD"]);
    try {
      git(["-C", directory, "config", "user.name", "BallerWatch Runtime"]);
      git(["-C", directory, "config", "user.email", "actions@users.noreply.github.com"]);

      for (const { file, raw } of changed) {
        const target = path.join(directory, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, raw);
      }
      git(["-C", directory, "add", "-f", "--", ...changed.map(({ file }) => file)]);

      try {
        git(["-C", directory, "diff", "--cached", "--quiet"]);
        console.log(`No remote ${scope} runtime-state changes were needed.`);
        return 0;
      } catch {}

      git(["-C", directory, "commit", "--quiet", "-m", `runtime(${scope}): update encrypted state`]);
      try {
        git(["-C", directory, "push", "--quiet", "origin", `HEAD:${STATE_BRANCH}`]);
        console.log(`Pushed ${changed.length} changed ${scope} runtime file(s) to ${STATE_BRANCH}.`);
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
  removeWorktree(directory);
  fetchStateBranch();
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
    git(["-C", directory, "add", "-A", "--"]);
    try {
      git(["-C", directory, "diff", "--cached", "--quiet"]);
      console.log("Runtime-state branch is already empty.");
      return 0;
    } catch {}
    git(["-C", directory, "commit", "--quiet", "-m", "runtime: purge generated state"]);
    git(["-C", directory, "push", "--quiet", "origin", `HEAD:${STATE_BRANCH}`]);
    console.log(`Purged ${removed} runtime file(s) from ${STATE_BRANCH}.`);
    return removed;
  } finally {
    removeWorktree(directory);
  }
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
  else throw new Error("Usage: node shared/runtime-state.mjs pull|push|clean <scope> | purge");
}
