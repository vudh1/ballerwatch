import assert from "node:assert/strict";
import test from "node:test";

import { purgeCalendarEvents } from "../../../backend/league/google-calendar-purge.mjs";

function fakeResponse(payload) {
  return {ok: true, status: 200, json: async () => payload};
}

test("purge sends authenticated action and returns aggregate counts", async () => {
  const oldEnv = {...process.env};
  process.env.GOOGLE_CALENDAR_WEBHOOK_URL = "https://example.invalid/calendar";
  process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = "secret";
  let body;
  const lines = [];
  const oldLog = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    const result = await purgeCalendarEvents({
      fetchImpl: async (_url, options) => {
        body = JSON.parse(options.body);
        return fakeResponse({
          ok: true,
          action: "purge",
          deleted: 3,
          stale: 1,
          clearedProperties: 4,
        });
      },
    });
    assert.equal(body.action, "purge");
    assert.equal(body.secret, "secret");
    assert.equal(result.deleted, 3);
    assert.ok(lines.some((line) => line.includes("calendarDeleted=3")));
    assert.ok(lines.some((line) => line.includes("calendarStaleMappingsCleared=1")));
  } finally {
    console.log = oldLog;
    process.env = oldEnv;
  }
});

test("purge surfaces bridge error", async () => {
  const oldEnv = {...process.env};
  process.env.GOOGLE_CALENDAR_WEBHOOK_URL = "https://example.invalid/calendar";
  process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET = "secret";
  try {
    await assert.rejects(
      purgeCalendarEvents({
        fetchImpl: async () => fakeResponse({
          ok: false,
          action: "purge",
          error: "legacy marker scan failed",
        }),
      }),
      /legacy marker scan failed/,
    );
  } finally {
    process.env = oldEnv;
  }
});

test("purge requires bridge configuration", async () => {
  const oldEnv = {...process.env};
  delete process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  delete process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET;
  try {
    await assert.rejects(purgeCalendarEvents(), /GOOGLE_CALENDAR_WEBHOOK_URL is required/);
  } finally {
    process.env = oldEnv;
  }
});
