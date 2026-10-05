import test from "node:test";
import assert from "node:assert/strict";
import {
  absoluteMinutesUntilStart,
  localMinutesUntilStart,
  matchStartReminderDue,
  rsvpReminderDue,
} from "../../../backend/shared/match-reminders.mjs";

test("pickup reminder windows are one day and one hour before start", () => {
  assert.equal(localMinutesUntilStart({
    matchDate: "2026-10-06",
    startMinute: 20 * 60,
    nowDate: "2026-10-05",
    nowMinute: 19 * 60,
  }), 1500);
  assert.equal(rsvpReminderDue(1440), true);
  assert.equal(rsvpReminderDue(61), true);
  assert.equal(rsvpReminderDue(60), false);
  assert.equal(matchStartReminderDue(60), true);
  assert.equal(matchStartReminderDue(1), true);
  assert.equal(matchStartReminderDue(0), false);
});

test("absolute league reminder time uses real offsets", () => {
  const now = new Date("2026-10-05T19:05:00-07:00");
  assert.equal(
    absoluteMinutesUntilStart("2026-10-05T20:00:00-07:00", now),
    55,
  );
  assert.equal(matchStartReminderDue(55), true);
});
