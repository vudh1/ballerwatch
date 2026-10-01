import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendWebNotification,
  loadWebNotificationChannel,
} from "../../shared/web-notifications.mjs";

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
