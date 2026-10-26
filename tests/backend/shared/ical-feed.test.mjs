import test from "node:test";
import assert from "node:assert/strict";
import { calendarToIcs } from "../../../backend/shared/ical-feed.mjs";

test("calendar exports valid UTC times and stable identifiers, no RSVP names", () => {
  const game = { id: "league:abc", kind: "league", date: "2026-11-10",
    title: "Third Touch FC vs WSC Young Boys", startTime: "8:00 PM", endTime: "10:00 PM",
    jerseyColor: "Gold", location: "Magnuson #6" };
  const text = calendarToIcs([game, game], { updatedAt: "2026-10-24T18:00:00Z" });
  assert.match(text, /BEGIN:VCALENDAR\r\n/);
  assert.match(text, /DTSTART:20261111T040000Z/);
  assert.match(text, /DTEND:20261111T060000Z/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(text, /Jersey: Gold/);
  assert.doesNotMatch(text, /RSVP name|guestProfile|password/);
});
test("daylight savings applies to November and all-day when kickoff is unknown", () => {
  const a = calendarToIcs([{id:"a",date:"2026-11-03",startTime:"8:00 PM",endTime:"10:00 PM"}]);
  assert.match(a, /DTSTART:20261104T040000Z/);
  const b = calendarToIcs([{id:"b",date:"2026-12-10"}]);
  assert.match(b, /DTSTART;VALUE=DATE:20261210/);
  assert.match(b, /DTEND;VALUE=DATE:20261211/);
});
test("escape injection and keep watch events separate", () => {
  const text = calendarToIcs([{ id:"watch:nba:42", kind:"watch", sport:"basketball",
    title:"A,B;C\\D\nX", startUtc:"2026-10-26T00:00:00Z"}]);
  assert.match(text, /DESCRIPTION:Watching · professional sports/);
  assert.match(text, /A\\,B\\;C\\\\D\\nX/);
  assert.match(text, /DTEND:20261026T030000Z/);
});

test("watch calendar titles and descriptions identify the actual competition", () => {
  const fixtures = [
    {id:"watch:eng.1:1",kind:"watch",title:"Arsenal vs Chelsea",
      competition:"Premier League",startUtc:"2026-11-02T20:00:00Z"},
    {id:"watch:uefa.champions:2",kind:"watch",title:"Arsenal vs Benfica",
      competition:"UEFA Champions League",startUtc:"2026-11-04T20:00:00Z"},
    {id:"watch:uefa.europa:3",kind:"watch",title:"Arsenal vs Porto",
      competition:"UEFA Europa League",startUtc:"2026-11-06T20:00:00Z"},
    {id:"watch:uefa.nations:4",kind:"watch",title:"Portugal vs Spain",
      competition:"UEFA Nations League",startUtc:"2026-11-08T20:00:00Z"},
  ];
  const ics = calendarToIcs(fixtures, { updatedAt: "2026-10-25T12:00:00Z" });
  // RFC 5545 folds lines after 75 bytes; compare unfolded event properties.
  const unfolded = ics.replace(/\r\n /g, "");
  for (const game of fixtures) {
    assert.ok(unfolded.includes("SUMMARY:" + game.competition + " · " + game.title), game.competition);
    assert.ok(unfolded.includes("Competition: " + game.competition), game.competition);
    assert.ok(unfolded.includes(encodeURIComponent(game.id) + "@ballerwatch"));
  }
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
});
