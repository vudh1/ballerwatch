/**
 * Producer contract regression: synthetic Vela feed snapshots only.
 * No cross-app runtime, subscriptions, notifications or real sports data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { syntheticCalendarIcs } from "../../fixtures/friday/ballerwatch-calendar-v1.mjs";

function events(ics) {
  return ics.replace(/\r\n /g, "").split("BEGIN:VEVENT\r\n").slice(1)
    .map(part => part.split("END:VEVENT")[0]);
}
function property(event, name) {
  return event.split("\r\n").find(line => line.startsWith(name + ":"))?.slice(name.length + 1);
}

test("synthetic v1 fixture emits RFC 5545 UTC timestamps across Pacific DST", () => {
  const output = syntheticCalendarIcs();
  const list = events(output);
  assert.match(output, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
  assert.equal(list.length, 4, "duplicate source game must become one VEVENT");
  assert.ok(list.some(event => event.includes("DTSTART:20260308T040000Z")));
  assert.ok(list.some(event => event.includes("DTEND:20260308T060000Z")));
  assert.ok(list.some(event => event.includes("DTSTART:20260309T030000Z")));
  assert.ok(list.some(event => event.includes("DTEND:20260309T050000Z")));
  assert.match(output, /X-WR-TIMEZONE:America\/Los_Angeles/);
  assert.ok(output.endsWith("END:VCALENDAR\r\n"));
  const ids = list.map(event => property(event, "UID"));
  assert.equal(new Set(ids).size, 4);
  assert.ok(ids.every(uid => uid?.endsWith("@ballerwatch")));
});

test("in-progress, cancellation and published-channel semantics remain explicit", () => {
  const output = syntheticCalendarIcs();
  const list = events(output);
  const watching = list.find(event => property(event, "UID")?.includes("in-progress"));
  const cancelled = list.find(event => property(event, "UID")?.includes("cancelled"));
  assert.ok(watching, "an already-started game must remain in the current snapshot");
  assert.match(watching, /DTSTART:20261101T170000Z/);
  assert.match(watching, /DTEND:20261101T190000Z/);
  assert.match(watching, /SUMMARY:Example League · Demo United vs Sample City/);
  assert.match(watching, /US TV: Example Sports/);
  assert.match(cancelled, /STATUS:CANCELLED/);
  assert.doesNotMatch(output, /RSVP name|recoveryCode|Bearer |calendar-ics\//);
});

test("updated full snapshot keeps stable IDs and omits removed games", () => {
  const original = events(syntheticCalendarIcs());
  const updated = events(syntheticCalendarIcs("updated"));
  const firstIds = original.map(event => property(event, "UID"));
  const nextIds = updated.map(event => property(event, "UID"));
  assert.equal(original.length, 4);
  assert.equal(updated.length, 3);
  assert.deepEqual(nextIds, firstIds.slice(1), "source IDs do not rotate on update");
  const ongoing = updated.find(event => property(event, "UID")?.includes("in-progress"));
  assert.doesNotMatch(ongoing, /US TV:/, "never invent a broadcast after removal");
  assert.match(updated.at(-1), /STATUS:CANCELLED/);
  assert.throws(() => syntheticCalendarIcs("unknown"), RangeError);
});
