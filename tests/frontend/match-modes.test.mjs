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
  assert.equal(watchCoverage({broadcasts:["Prime Video","NBC"],drogonChannels:["NBC"]}), "Prime Video");
  assert.equal(watchCoverage({broadcasts:["ESPN","NBA TV","Peacock"],drogonChannels:["ESPN","NBA TV"]}),
    "ESPN · NBA TV · check DrogonTV guide");
  assert.equal(watchCoverage({broadcasts:["NBA TV"],drogonChannels:["NBA TV"]}), "NBA TV · check DrogonTV guide");
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

test("Playing and Watching labels are consistent in navigation and first-run setup", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../../frontend/web/index.html", import.meta.url), "utf8");
  for (const [id, label] of [["mode-play", "Playing"], ["mode-watch", "Watching"]]) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*>' + label + '</button>'));
  }
  assert.match(html, /<p class="eyebrow">PLAYING<\/p>/);
  assert.match(html, /<p class="eyebrow">WATCHING<\/p>/);
  assert.match(html, /aria-label="Playing or Watching"/);
  assert.match(html, /<label for="watch-teams-trigger">Watching · NBA/);
  assert.doesNotMatch(html, /Teams to (?:play|watch)/i);
});

test("lineup suggestions use only precomputed exact matches without client lookup", () => {
  assert.equal(watchCoverage({broadcasts:["NBA TV"]}), "");
  assert.equal(watchCoverage({broadcasts:["ESPN"],drogonChannels:["ESPN"]}),
    "ESPN · check DrogonTV guide");
  assert.equal(watchCoverage({broadcasts:["FS1"],drogonChannels:["Fox Sports 1"]}),
    "Fox Sports 1 · check DrogonTV guide");
  assert.equal(watchCoverage({broadcasts:["ESPN2"],drogonChannels:["ESPN 2"]},
    {prime:false,espn:false,drogon:true}), "ESPN 2 · check DrogonTV guide");
  assert.equal(watchCoverage({broadcasts:["FS1"],drogonChannels:["Fox Sports 1"]},
    {prime:true,espn:true,drogon:false}), "");
  assert.equal(watchCoverage({broadcasts:[],drogonChannels:["NBA TV"]}), "");
});
