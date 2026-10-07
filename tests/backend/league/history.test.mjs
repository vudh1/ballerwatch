import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HISTORY_REFRESH_MS,
  historyRefreshDue,
  historySeasonIds,
  normalizeHistoryAggregate,
} from "../../../backend/league/history.mjs";

test("RATS history discovery scans every seasonal slug across the configured year range", () => {
  const ids = historySeasonIds(new Date("2026-10-07T12:00:00Z"), 2025);
  assert.deepEqual(ids.slice(0, 4), [
    "winter-2025",
    "spring-2025",
    "summer-2025",
    "fall-2025",
  ]);
  assert.deepEqual(ids.slice(-4), [
    "winter-2027",
    "spring-2027",
    "summer-2027",
    "fall-2027",
  ]);
  assert.equal(ids.length, 12);
});

test("RATS history refresh is daily and treats missing timestamps as stale", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  assert.equal(historyRefreshDue(null, now), true);
  assert.equal(
    historyRefreshDue({updatedAt: "2026-10-07T00:01:00Z"}, now),
    false,
  );
  assert.equal(
    historyRefreshDue(
      {updatedAt: new Date(now.getTime() - HISTORY_REFRESH_MS - 1).toISOString()},
      now,
    ),
    true,
  );
});

test("RATS history normalizes every public team and scored event in an aggregate", () => {
  const season = normalizeHistoryAggregate("fall-2026", {
    teams: [
      {name: "Team Alpha", day: "Thursday", gender: "Men's", division: "1"},
      {name: "Team Beta", day: "Thursday", gender: "Men's", division: "1"},
    ],
    events: [
      {
        id: 42,
        start_date: "2026-10-01",
        start_time: "20:30:00",
        home_team_name: "Team Alpha",
        away_team_name: "Team Beta",
        home_score: "4",
        away_score: 2,
      },
      {
        id: 43,
        start_date: "2026-10-08",
        start_time: "20:30:00",
        home_team_name: "Team Beta",
        away_team_name: "Team Alpha",
      },
    ],
  });

  assert.equal(season.seasonId, "fall-2026");
  assert.equal(season.label, "Fall 2026");
  assert.equal(season.teams.length, 2);
  assert.equal(season.matches.length, 2);
  assert.deepEqual(
    [season.matches[0].homeScore, season.matches[0].awayScore],
    [4, 2],
  );
  assert.deepEqual(
    [season.matches[1].homeScore, season.matches[1].awayScore],
    [null, null],
  );
});

test("RATS history ignores empty unpublished season aggregates", () => {
  assert.equal(
    normalizeHistoryAggregate("winter-2000", {teams: [], events: []}),
    null,
  );
});

test("league workflow refreshes the encrypted historical index without notifications", () => {
  const workflow = fs.readFileSync(".github/workflows/league.yml", "utf8");
  const paths = fs.readFileSync("backend/shared/runtime-paths.mjs", "utf8");

  assert.match(workflow, /Refresh RATS historical index when stale/);
  assert.match(workflow, /node backend\/league\/history\.mjs/);
  assert.match(workflow, /TRACKER_STATE_KEY:/);
  assert.doesNotMatch(
    workflow.match(/Refresh RATS historical index when stale[\s\S]*?(?=\n\s{6}- name:|$)/)?.[0] || "",
    /web-push|calendar/i,
  );
  assert.match(paths, /"league\/state\/history\.json"/);
});
