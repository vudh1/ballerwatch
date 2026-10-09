import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("pickup notifications use threshold/detail changes plus scheduled reminders", () => {
  const source = fs.readFileSync("backend/pickup/notify.mjs", "utf8");

  assert.match(source, /processScheduledReminders/);
  assert.match(source, /rsvpReminderDue/);
  assert.match(source, /matchStartReminderDue/);
  assert.match(source, /processCapacityAlerts/);
  assert.match(source, /pickupCapacityAlert/);
  assert.match(source, /capacitySnapshots/);
  assert.match(source, /pickup-capacity-\$\{sourceDate\}-\$\{alert\.reserved\}/);
  assert.doesNotMatch(source, /capacityThresholdReached|after <= 3/);
  assert.match(source, /Pickup RSVP reminder/);
  assert.match(source, /Pickup starts in 1 hour/);
  assert.match(source, /No primary match-detail change/);
  assert.match(source, /matchDate: event\.date/);
  assert.match(source, /eventForDate\(date, settings\)/);
  assert.match(source, /settings\.mutedDates/);
  assert.doesNotMatch(source, /YOU ARE CONFIRMED|WAITLIST POSITION|person\.name/);
});

test("pickup web delivery uses the public-safe text boundary", () => {
  const source = fs.readFileSync("backend/pickup/notify.mjs", "utf8");
  assert.match(source, /body: webText \|\| body/);
  assert.doesNotMatch(source, /Changes:\s*["'\`]/);
});
