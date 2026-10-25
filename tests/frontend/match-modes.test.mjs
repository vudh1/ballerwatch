import test from "node:test";
import assert from "node:assert/strict";
import { modeGames, watchMatchDetails, PLAY, WATCH } from "../../frontend/web/lib/match-modes.mjs";

const play = [{ id: "pickup:a", kind: "pickup", date: "2026-10-25" },
  { id: "league:b", kind: "league", date: "2026-10-26" }];
const watched = [{ id: "watch:nba:1", kind: "watch", date: "2026-10-26",
  sport: "basketball", competition: "NBA", title: "Lakers vs Warriors",
  startUtc: "2026-10-27T02:00:00Z", location: "Arena" }];

test("default play mode contains only personal games and not watch fixtures", () => {
  assert.deepEqual(modeGames(PLAY, play, watched).map(g => g.id), ["pickup:a", "league:b"]);
  assert.deepEqual(modeGames(WATCH, play, watched).map(g => g.id), ["watch:nba:1"]);
  assert.deepEqual(modeGames(WATCH, play, []), []);
});
test("watch presentation uses Pacific match time with DST and no personal controls", () => {
  assert.deepEqual(watchMatchDetails(watched[0]), {
    title: "Lakers vs Warriors", competition: "NBA",
    time: "Mon, Oct 26, 7:00 PM PT", location: "Arena",
  });
  assert.equal(watchMatchDetails(play[0]), null);
});
