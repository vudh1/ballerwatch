import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { syncCalendar } from "../../../backend/league/google-calendar-sync.mjs";

test("successful changed match advances state and records one updated notification", async () => {
  const originalCwd = process.cwd();
  const originalUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  const originalSecret = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-sync-"));

  try {
    process.chdir(dir);
    process.env.GOOGLE_CALENDAR_WEBHOOK_URL = "https://example.invalid/calendar";
    process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = "secret";

    const match = {
      key: "v2:test",
      team: "Team Alpha",
      opponent: "Opponent",
      date: "2026-10-05",
      start: "2026-10-05T19:30:00-07:00",
      end: "2026-10-05T20:30:00-07:00",
      calendarFingerprint: "new-fingerprint",
    };
    fs.writeFileSync("schedule.json", JSON.stringify({
      seasonId: "fall-2026",
      contentHash: "content-new",
    }));
    fs.writeFileSync("calendar-snapshot.json", JSON.stringify({
      version: 1,
      appliedMatches: {
        "v2:test": {
          fingerprint: "old-fingerprint",
          match: {...match, start: "2026-10-05T19:15:00-07:00"},
        },
      },
    }));
    fs.writeFileSync("calendar-changes.json", JSON.stringify({
      pending: [{type: "changed", key: "v2:test", match}],
    }));

    let posted;
    const result = await syncCalendar({
      now: new Date("2026-10-01T12:00:00-07:00"),
      fetchImpl: async (_url, options) => {
        posted = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            results: [{ok: true, key: "v2:test", action: "updated"}],
          }),
        };
      },
    });

    assert.equal(posted.updates.length, 1);
    assert.equal(posted.updates[0].type, "changed");
    assert.equal(result.updates.length, 1);
    assert.equal(result.updates[0].action, "updated");

    const state = JSON.parse(fs.readFileSync("calendar-snapshot.json", "utf8"));
    assert.equal(state.appliedMatches["v2:test"].fingerprint, "new-fingerprint");
    const notification = JSON.parse(fs.readFileSync("notification-update.json", "utf8"));
    assert.deepEqual(notification.updates.map((item) => item.action), ["updated"]);
  } finally {
    process.chdir(originalCwd);
    if (originalUrl === undefined) delete process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
    else process.env.GOOGLE_CALENDAR_WEBHOOK_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET;
    else process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = originalSecret;
  }
});

test("deleting a tracked fixture removes its snapshot without announcing a new match", async () => {
  const originalCwd = process.cwd();
  const originalUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  const originalSecret = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-sync-delete-"));
  try {
    process.chdir(dir);
    process.env.GOOGLE_CALENDAR_WEBHOOK_URL = "https://example.invalid/calendar";
    process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = "secret";
    const game = {key: "v2:hidden", team: "A", opponent: "B", date: "2026-10-05"};
    fs.writeFileSync("schedule.json", JSON.stringify({seasonId: "fall-2026"}));
    fs.writeFileSync("calendar-snapshot.json", JSON.stringify({
      appliedMatches: {"v2:hidden": {fingerprint: "old", match: game}},
    }));
    fs.writeFileSync("calendar-changes.json", JSON.stringify({
      pending: [{type: "deleted", key: "v2:hidden", match: game}],
    }));
    let posted;
    await syncCalendar({
      fetchImpl: async (_url, options) => {
        if (!options?.method) return {ok: true, json: async () => ({version: 6})};
        posted = JSON.parse(options.body);
        return {ok: true, json: async () => ({
          ok: true, results: [{ok: true, key: "v2:hidden", action: "deleted"}],
        })};
      },
    });
    assert.deepEqual(posted.updates.map((item) => item.type), ["deleted"]);
    const state = JSON.parse(fs.readFileSync("calendar-snapshot.json", "utf8"));
    assert.equal(state.appliedMatches["v2:hidden"], undefined);
    const notices = JSON.parse(fs.readFileSync("notification-update.json", "utf8"));
    assert.deepEqual(notices.updates, []);
  } finally {
    process.chdir(originalCwd);
    if (originalUrl === undefined) delete process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
    else process.env.GOOGLE_CALENDAR_WEBHOOK_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET;
    else process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = originalSecret;
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
