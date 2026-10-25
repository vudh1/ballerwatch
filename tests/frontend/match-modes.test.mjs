import test from "node:test";
import assert from "node:assert/strict";
import { watchCoverage } from "../../frontend/web/lib/watch-coverage.mjs";
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
test("watch presentation uses device-local kickoff and no unknown TV label", () => {
  assert.deepEqual(watchMatchDetails(watched[0]), {
    title: "Lakers vs Warriors", competition: "NBA",
    time: new Intl.DateTimeFormat("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(new Date(watched[0].startUtc)), location: "Arena",
    whereToWatch: "",
  });
  assert.equal(watchMatchDetails(play[0]), null);
});

test("show only actual listed channels on the user's chosen services", () => {
  assert.equal(watchCoverage({broadcasts:["Prime Video","NBC"]}), "Prime Video");
  assert.equal(watchCoverage({broadcasts:["ESPN","NBA TV","Peacock"]}),
    "ESPN · NBA TV · check DrogonTV guide");
  assert.equal(watchCoverage({broadcasts:["NBA TV"]}), "NBA TV · check DrogonTV guide");
  assert.equal(watchCoverage({broadcasts:["Peacock","Paramount+"]}),
    "");
  assert.equal(watchCoverage({broadcasts:[]}), "");
});

test("unselected services are not advertised to a device", () => {
  assert.equal(watchCoverage({broadcasts:["Prime Video","ESPN"]},
    {prime:false,espn:true,drogon:false}), "ESPN");
  assert.equal(watchCoverage({broadcasts:["Prime Video"]},
    {prime:false,espn:false,drogon:false}), "");
});
