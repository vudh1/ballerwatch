import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildWebText,
  formatTime,
  jerseyIcon,
  notifyWeb,
} from "../../league/web-notify.mjs";
import { loadWebNotificationChannel } from "../../shared/web-notifications.mjs";

test("formatting preserves Pacific time and jersey icon behavior", () => {
  assert.equal(formatTime("2026-10-05T19:15:00-07:00"), "Mon 10/05 7:15 PM");
  assert.equal(jerseyIcon("Black"), "⚫");
  assert.equal(jerseyIcon("Purple / White"), "⚪");
});

test("schedule update records exactly one encrypted web notification", (t) => {
  const originalCwd = process.cwd();
  const previousKey = process.env.TRACKER_STATE_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-web-notify-"));
  process.chdir(dir);
  process.env.TRACKER_STATE_KEY = "synthetic-web-notify-key";
  t.after(() => {
    process.chdir(originalCwd);
    if (previousKey === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previousKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const updates = [{
    action: "updated",
    match: {
      team: "Team Alpha",
      opponent: "Opponent",
      start: "2026-10-05T19:15:00-07:00",
      location: "Field",
      jerseyColor: "Black",
      opponentJerseyColor: "White",
    },
  }];
  fs.writeFileSync("notification-update.json", JSON.stringify({ updates }));

  assert.equal(notifyWeb(), true);
  const board = loadWebNotificationChannel("league");
  assert.equal(board.entries.length, 1);
  assert.match(board.entries[0].body, /Updated:/);
  assert.match(board.entries[0].body, /Team Alpha/);
  assert.equal(fs.existsSync(".runtime/web-push-pending"), true);
});

test("web notification builder remains one schedule-change payload", () => {
  const text = buildWebText([{
    action: "created",
    match: {
      team: "A",
      opponent: "B",
      start: null,
      location: null,
      jerseyColor: null,
      opponentJerseyColor: null,
    },
  }]);
  assert.match(text, /^Added:/);
  assert.equal(text.match(/Added:/g)?.length, 1);
});
