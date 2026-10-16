import assert from "node:assert/strict";
import test from "node:test";
import { materialFixtureChanged, scheduleNotificationUpdates } from "../../../backend/league/schedule-updates.mjs";

const now = new Date("2026-10-16T12:00:00-07:00");
const game = { key: "v2:fixture-1", date: "2026-10-20",
  team: "Alpha", opponent: "Beta", start: "2026-10-20T19:00:00-07:00",
  end: "2026-10-20T21:00:00-07:00", jerseyColor: "White",
  teamScore: null, opponentScore: null };
const feed = (matches, seasonId = "fall-2026") => ({ok: true, seasonId, teams: [{name: "Alpha", matches}]});

test("verified schedule changes generate a single notification without Google Calendar", () => {
  const next = {...game, start: "2026-10-20T20:00:00-07:00"};
  const previous = feed([game]);
  const current = { ...feed([next]), teams: [
    {name:"Alpha",matches:[next]}, {name:"Beta",matches:[next]},
  ]};
  assert.deepEqual(scheduleNotificationUpdates(previous,current,now), [{action:"updated",match:next}]);
});

test("fresh installation, unchanged and score-only fixtures are silent", () => {
  const score = {...game,teamScore:1,opponentScore:2};
  assert.deepEqual(scheduleNotificationUpdates(null,feed([game]),now), []);
  assert.deepEqual(scheduleNotificationUpdates(feed([game]),feed([score]),now), []);
  assert.equal(materialFixtureChanged(game,score),false);
});

test("new future fixture is reported; expired fixtures and season transitions are silent", () => {
  assert.deepEqual(scheduleNotificationUpdates(feed([]),feed([game]),now), [{action:"created",match:game}]);
  assert.deepEqual(scheduleNotificationUpdates(feed([]),feed([{...game,date:"2026-10-10"}]),now),[]);
  assert.deepEqual(scheduleNotificationUpdates(feed([],"summer-2026"),feed([game]),now),[]);
});
