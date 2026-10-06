import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendWebNotification,
  loadWebNotificationChannel,
} from "../../../backend/shared/web-notifications.mjs";

test("stores notification board entries encrypted and returns sanitized metadata", (t) => {
  const cwd = process.cwd();
  const env = process.env;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-board-"));
  process.chdir(dir);
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-board-key" };
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const entry = appendWebNotification("pickup", {
    title: "Pickup update",
    body: "15/16 reserved — 1 spot left",
    tag: "pickup-2026-10-08",
  }, { now: new Date("2026-10-01T20:00:00Z") });

  assert.equal(entry.channel, "pickup");
  assert.match(entry.body, /1 spot left/);
  const raw = fs.readFileSync("state/web-board-pickup.json", "utf8");
  assert.doesNotMatch(raw, /15\/16 reserved/);

  const loaded = loadWebNotificationChannel("pickup");
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].tag, "pickup-2026-10-08");
});


test("suppresses exact duplicate board entries and does not queue another push", (t) => {
  const cwd = process.cwd();
  const env = process.env;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-board-dedupe-"));
  process.chdir(dir);
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-board-key" };
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const first = appendWebNotification("pickup", {
    title: "Pickup update",
    body: "12/16 reserved - Wed 10/7",
    tag: "pickup-2026-10-07",
  }, { now: new Date("2026-10-02T16:00:00Z") });

  fs.rmSync(".runtime/web-push-pending", { force: true });

  const second = appendWebNotification("pickup", {
    title: "Pickup update",
    body: "12/16 reserved - Wed 10/7",
    tag: "pickup-2026-10-07",
  }, { now: new Date("2026-10-02T17:00:00Z") });

  const loaded = loadWebNotificationChannel("pickup");
  assert.equal(loaded.entries.length, 1);
  assert.equal(second.id, first.id);
  assert.equal(fs.existsSync(".runtime/web-push-pending"), false);
});


test("explicit rootDir keeps notification board and pending marker at repo root", (ctx) => {
  const cwd = process.cwd();
  const env = process.env;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-board-root-"));
  const leagueDir = path.join(root, "league");
  fs.mkdirSync(leagueDir, { recursive: true });
  process.chdir(leagueDir);
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-board-root-key" };
  ctx.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(root, { recursive: true, force: true });
  });

  appendWebNotification("league", {
    title: "Match starts in 1 hour",
    body: "Team Alpha vs Team Beta",
    tag: "rats-start-test",
  }, {
    now: new Date("2026-10-05T19:00:00-07:00"),
    rootDir: "..",
  });

  assert.equal(fs.existsSync(path.join(root, "state/web-board-league.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".runtime/web-push-pending")), true);
  assert.equal(fs.existsSync(path.join(leagueDir, "state/web-board-league.json")), false);
  assert.equal(fs.existsSync(path.join(leagueDir, ".runtime/web-push-pending")), false);

  const board = loadWebNotificationChannel("league", { rootDir: ".." });
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].tag, "rats-start-test");
});
