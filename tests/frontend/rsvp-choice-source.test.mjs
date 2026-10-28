import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { nextPublishedPickupDate } from "../../frontend/web/lib/rsvp-choice-source.mjs";

test("fresh devices can select a name from an upcoming published RSVP date without a saved profile", () => {
  const canonicalGames = [
    { kind: "league", date: "2026-10-27" },
    { kind: "free_pickup", date: "2026-10-28" },
    { kind: "pickup", sourceDate: "2026-10-29", date: "2026-10-29" },
    { kind: "pickup", sourceDate: "2026-11-05", date: "2026-11-05" },
  ];
  // On a brand-new device, the personalized dashboard intentionally hides
  // pickup until a local RSVP name has been selected. The source must not
  // depend on those personalized games or it can never show any choices.
  const personalizedGames = [];
  assert.equal(nextPublishedPickupDate(personalizedGames, "2026-10-26"), "");
  assert.equal(nextPublishedPickupDate(canonicalGames, "2026-10-26"), "2026-10-29");
});

test("only the next future, individually published pickup is eligible", () => {
  const games = [
    { kind: "pickup", date: "2026-10-24" },
    { kind: "free_pickup", date: "2026-10-29" },
    { kind: "league", date: "2026-10-27" },
    { kind: "pickup", date: "2026-11-05", sourceDate: "2026-11-05" },
  ];
  assert.equal(nextPublishedPickupDate(games, "2026-10-26"), "2026-11-05");
  assert.equal(nextPublishedPickupDate(games, "2026-11-06"), "");
  assert.equal(nextPublishedPickupDate(games, "bad-date"), "");
});

test("RSVP names use registered-member choices and preserve canonical event-only fallback", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const loader = app.split("async function loadRsvpNameOptions() {")[1]
    ?.split("\nfunction beginFirstRunSetup()")[0] || "";
  assert.match(loader,
    /nextPublishedPickupDate\(currentCanonicalCalendar\?\.games \|\| \[\], todaySeattleKey\(\)\)/);
  assert.doesNotMatch(loader, /nextPublishedPickupDate\(currentCalendar/);
  assert.match(loader, /\/web\/rsvp-members/);
  assert.match(loader, /\/web\/rsvp-roster\?date=/);
  assert.match(loader, /Choosing a name does not sign you up/);
  assert.match(loader, /firstRunWizard\?\.setNameOptions\(options\)/);
  assert.doesNotMatch(loader, /roster-catalog|localStorage\.setItem|sessionStorage\.setItem/);
});
