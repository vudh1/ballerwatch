import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  auditRuntimeStateBranch,
  pullRuntimeState,
  purgeRuntimeState,
  pushRuntimeState,
  snapshotPushArgs,
} from "../../shared/runtime-state.mjs";
import {
  decryptState,
  encryptState,
  isEncryptedStateEnvelope,
} from "../../shared/state-crypto.mjs";
import { saveFailoverState } from "../../shared/failover-state.mjs";

test("snapshot pushes use an optimistic force-with-lease", () => {
  assert.deepEqual(
    snapshotPushArgs("runtime-state", "a".repeat(40), "b".repeat(40)),
    [
      "push",
      "--quiet",
      `--force-with-lease=refs/heads/runtime-state:${"a".repeat(40)}`,
      "origin",
      `${"b".repeat(40)}:refs/heads/runtime-state`,
    ],
  );
});

test("purged branch boots clean without restoring encrypted stale backup or calling Cloudflare", async t => {
  const cwd = process.cwd();
  const env = process.env;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-purge-"));
  t.after(() => { process.chdir(cwd); process.env = env; fs.rmSync(dir, { recursive: true, force: true }); });
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-encryption-test-key" };
  const git = (args, at = dir) => execFileSync("git", args, { cwd: at, stdio: "pipe" });
  git(["init", "--bare", "remote.git"]);
  git(["clone", "remote.git", "work"]);
  process.chdir(path.join(dir, "work"));
  const run = args => git(args, process.cwd());
  run(["config", "user.name", "Fixture"]);
  run(["config", "user.email", "fixture@example.invalid"]);
  run(["checkout", "-b", "runtime-state"]);
  fs.mkdirSync("state", { recursive: true });
  fs.writeFileSync("state/watchdog.json", JSON.stringify(encryptState({ synthetic: true })) + "\n");
  fs.writeFileSync("README.md", "synthetic source fixture\n");
  run(["add", "."]); run(["commit", "-m", "encrypted fixture"]); run(["push", "origin", "runtime-state"]);
  saveFailoverState("watchdog");
  t.mock.method(globalThis, "fetch", () => { assert.fail("No Cloudflare or Telegram calls allowed"); });
  assert.equal(await pullRuntimeState("watchdog"), 1);
  assert.equal(purgeRuntimeState(), 1);
  run(["fetch", "--quiet", "origin", "runtime-state"]);
  assert.equal(run(["rev-list", "--count", "FETCH_HEAD"]).toString().trim(), "1");
  assert.doesNotMatch(run(["cat-file", "-p", "FETCH_HEAD"]).toString(), /^parent /m);
  assert.equal(run(["ls-tree", "-r", "--name-only", "FETCH_HEAD"]).toString().trim(), "");

  assert.equal(await pullRuntimeState("watchdog"), 0);
  assert.equal(fs.existsSync("state/watchdog.json"), false);
  assert.equal(fs.existsSync(".runtime/failover/watchdog.json"), true);

  fs.mkdirSync("state", { recursive: true });
  fs.writeFileSync("state/watchdog.json", JSON.stringify(encryptState({ rebuilt: true })) + "\n");
  assert.equal(await pushRuntimeState("watchdog"), 1);
  run(["fetch", "--quiet", "origin", "runtime-state"]);
  assert.equal(run(["rev-list", "--count", "FETCH_HEAD"]).toString().trim(), "1");
  assert.doesNotMatch(run(["cat-file", "-p", "FETCH_HEAD"]).toString(), /^parent /m);
  assert.equal(
    run(["ls-tree", "-r", "--name-only", "FETCH_HEAD"]).toString().trim(),
    "state/watchdog.json",
  );
});


test("legacy runtime files migrate to complete encrypted envelopes before push", async t => {
  const cwd = process.cwd();
  const env = process.env;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-runtime-migrate-"));
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-runtime-migration-key" };

  const git = (args, at = dir) =>
    execFileSync("git", args, { cwd: at, stdio: "pipe" });
  git(["init", "--bare", "remote.git"]);
  git(["clone", "remote.git", "work"]);
  process.chdir(path.join(dir, "work"));
  const run = args => git(args, process.cwd());
  run(["config", "user.name", "Fixture"]);
  run(["config", "user.email", "fixture@example.invalid"]);
  run(["checkout", "-b", "runtime-state"]);

  fs.mkdirSync("state", { recursive: true });
  fs.writeFileSync(
    "state/listener.json",
    JSON.stringify({
      lastUpdateId: 42,
      settings: encryptState({ ownerRsvpName: "Synthetic User" }),
    }) + "\n",
  );
  run(["add", "."]);
  run(["commit", "-m", "legacy partial runtime state"]);
  run(["push", "origin", "runtime-state"]);

  assert.equal(await pullRuntimeState("listener"), 1);
  const migrated = JSON.parse(fs.readFileSync("state/listener.json", "utf8"));
  assert.equal(isEncryptedStateEnvelope(migrated), true);
  assert.deepEqual(decryptState(migrated), {
    lastUpdateId: 42,
    settings: { ownerRsvpName: "Synthetic User" },
  });

  assert.equal(await pushRuntimeState("listener"), 1);
  assert.equal(auditRuntimeStateBranch(), 1);
  run(["fetch", "--quiet", "origin", "runtime-state"]);
  const stored = JSON.parse(
    run(["show", "FETCH_HEAD:state/listener.json"]).toString(),
  );
  assert.equal(isEncryptedStateEnvelope(stored), true);
});

test("runtime-state audit rejects a readable canonical payload", t => {
  const cwd = process.cwd();
  const env = process.env;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-runtime-audit-"));
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-runtime-audit-key" };

  const git = (args, at = dir) =>
    execFileSync("git", args, { cwd: at, stdio: "pipe" });
  git(["init", "--bare", "remote.git"]);
  git(["clone", "remote.git", "work"]);
  process.chdir(path.join(dir, "work"));
  const run = args => git(args, process.cwd());
  run(["config", "user.name", "Fixture"]);
  run(["config", "user.email", "fixture@example.invalid"]);
  run(["checkout", "-b", "runtime-state"]);

  fs.mkdirSync("requests", { recursive: true });
  fs.writeFileSync(
    "requests/unknown.json",
    JSON.stringify({ version: 3, requests: [] }) + "\n",
  );
  run(["add", "."]);
  run(["commit", "-m", "readable runtime fixture"]);
  run(["push", "origin", "runtime-state"]);

  assert.throws(
    () => auditRuntimeStateBranch(),
    /Runtime-state encryption audit failed for: requests\/unknown\.json/,
  );
});
