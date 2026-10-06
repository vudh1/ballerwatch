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
  recordLeagueStartReminders,
} from "../../../backend/league/web-notify.mjs";
import { loadWebNotificationChannel } from "../../../backend/shared/web-notifications.mjs";

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


test("one-hour league reminder is emitted once per match", (t) => {
  const originalCwd = process.cwd();
  const previousKey = process.env.TRACKER_STATE_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-league-reminder-"));
  process.chdir(dir);
  process.env.TRACKER_STATE_KEY = "synthetic-league-reminder-key";
  t.after(() => {
    process.chdir(originalCwd);
    if (previousKey === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previousKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  fs.writeFileSync("schedule.json", JSON.stringify({
    teams: [{
      name: "Team Alpha",
      matches: [{
        key: "v2:hour-reminder",
        team: "Team Alpha",
        opponent: "Team Beta",
        start: "2026-10-05T20:00:00-07:00",
        location: "League Field",
        jerseyColor: "Black",
      }],
    }],
  }));

  const now = new Date("2026-10-05T19:05:00-07:00");
  assert.equal(recordLeagueStartReminders({ now }), true);
  assert.equal(recordLeagueStartReminders({ now }), false);

  const board = loadWebNotificationChannel("league");
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].title, "Match starts in 1 hour");
  assert.match(board.entries[0].body, /Team Alpha vs Team Beta/);
  assert.equal(fs.existsSync(".runtime/web-push-pending"), true);
  assert.doesNotMatch(fs.readFileSync("state/notify.json", "utf8"), /hour-reminder/);
});


test("league reminder uses shared root and repairs a recorded-but-undelivered reminder", (ctx) => {
  const originalCwd = process.cwd();
  const previousKey = process.env.TRACKER_STATE_KEY;
  const previousRoot = process.env.BALLERWATCH_WEB_STATE_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-league-root-reminder-"));
  const leagueDir = path.join(root, "league");
  fs.mkdirSync(leagueDir, { recursive: true });
  process.chdir(leagueDir);
  process.env.TRACKER_STATE_KEY = "synthetic-league-root-reminder-key";
  process.env.BALLERWATCH_WEB_STATE_ROOT = "..";
  ctx.after(() => {
    process.chdir(originalCwd);
    if (previousKey === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previousKey;
    if (previousRoot === undefined) delete process.env.BALLERWATCH_WEB_STATE_ROOT;
    else process.env.BALLERWATCH_WEB_STATE_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  fs.writeFileSync("schedule.json", JSON.stringify({
    teams: [{
      name: "Team Alpha",
      matches: [{
        key: "v2:root-hour-reminder",
        team: "Team Alpha",
        opponent: "Team Beta",
        start: "2026-10-05T20:00:00-07:00",
        location: "League Field",
        jerseyColor: "Black",
      }],
    }],
  }));

  const now = new Date("2026-10-05T19:05:00-07:00");
  assert.equal(recordLeagueStartReminders({ now }), true);
  assert.equal(fs.existsSync(path.join(root, "state/web-board-league.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".runtime/web-push-pending")), true);
  assert.equal(fs.existsSync("state/web-board-league.json"), false);

  // Reproduce tonight's old failure: reminder state was marked sent,
  // but the shared board/pending handoff never reached the repo root.
  fs.rmSync(path.join(root, "state/web-board-league.json"), { force: true });
  fs.rmSync(path.join(root, ".runtime/web-push-pending"), { force: true });

  assert.equal(recordLeagueStartReminders({ now }), true);
  const repaired = loadWebNotificationChannel("league", { rootDir: ".." });
  assert.equal(repaired.entries.length, 1);
  assert.equal(repaired.entries[0].tag, "rats-start-v2:root-hour-reminder");
  assert.equal(fs.existsSync(path.join(root, ".runtime/web-push-pending")), true);
});
