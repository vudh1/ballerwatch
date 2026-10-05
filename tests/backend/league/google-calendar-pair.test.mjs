import assert from "node:assert/strict";
import test from "node:test";

import { pairCalendar } from "../../../backend/league/google-calendar-pair.mjs";

function fakeResponse(payload) {
  return {ok: true, status: 200, json: async () => payload};
}

test("pairing sends marker and logs only non-identifying status", async () => {
  const oldEnv = {...process.env};
  process.env.GOOGLE_CALENDAR_WEBHOOK_URL = "https://example.invalid/calendar";
  process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = "secret";
  process.env.BALLERWATCH_CALENDAR_PAIR_MARKER = "bw-pair-test123";
  let body;
  const lines = [];
  const oldLog = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    const result = await pairCalendar({
      fetchImpl: async (_url, options) => {
        body = JSON.parse(options.body);
        return fakeResponse({
          ok: true,
          action: "pair-calendar",
          paired: true,
          markerDeleted: true,
          previousDeleted: 1,
          previousStale: 2,
        });
      },
    });
    assert.equal(body.action, "pair-calendar");
    assert.equal(body.marker, "bw-pair-test123");
    assert.equal(body.secret, "secret");
    assert.equal(result.paired, true);
    assert.ok(lines.some((line) => line.includes("calendarPaired=true")));
    assert.ok(lines.every((line) => !line.includes("calendarId")));
  } finally {
    console.log = oldLog;
    process.env = oldEnv;
  }
});

test("pairing surfaces safe bridge error", async () => {
  const oldEnv = {...process.env};
  process.env.GOOGLE_CALENDAR_WEBHOOK_URL = "https://example.invalid/calendar";
  process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = "secret";
  process.env.BALLERWATCH_CALENDAR_PAIR_MARKER = "bw-pair-test123";
  try {
    await assert.rejects(
      pairCalendar({
        fetchImpl: async () => fakeResponse({
          ok: false,
          action: "pair-calendar",
          error: "target calendar marker is not visible to the Apps Script account",
        }),
      }),
      /marker is not visible/,
    );
  } finally {
    process.env = oldEnv;
  }
});
