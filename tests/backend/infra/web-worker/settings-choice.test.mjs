import test from "node:test";
import assert from "node:assert/strict";
import { directIntent, privateRsvpNameOptions } from
  "../../../../backend/infra/web-worker/worker.mjs";

test("RSVP suggestions only use private current/future rosters and dedupe names", () => {
  const snapshot = {
    pickup: { dates: [{ date: "2026-10-20" }] },
    pickupPrivate: { events: {
      "2026-10-01": { players: [{ name: "Old Private Player" }] },
      "2026-10-20": {
        players: [{ name: "Alex" }, { name: "Sam" }, { name: "Alex" }],
        waitlist: [{ name: "Jordan" }, { name: "sam" }],
      },
      "2026-10-27": { players: [{ name: "Robin" }] },
    }},
  };
  assert.deepEqual(privateRsvpNameOptions(snapshot, "2026-10-14"), [
    "Alex", "Jordan", "Robin", "Sam",
  ]);
  assert.deepEqual(privateRsvpNameOptions({pickupPrivate: {events: {
    "2026-10-25": {players: {}, waitlist: null},
  }}}, "2026-10-14"), []);
});

test("sanitized wrong-answer pattern: dated league opponent + RSVP is not pickup status", () => {
  assert.equal(directIntent("Who is our opponent in Tuesday league RSVP game?"), "date_games");
  assert.equal(directIntent("Where is RATS match vs Team B on Wednesday?"), "date_games");
  assert.equal(directIntent("How many RSVP spots for Thursday pickup?"), "pickup_status");
  assert.equal(directIntent("What is my RSVP name?"), "my_rsvp_name");
});

