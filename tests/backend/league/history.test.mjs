import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  HISTORY_REFRESH_MS,
  historyRefreshDue,
  historySeasonIds,
  normalizeHistoryAggregate,
  refreshRatsHistory,
} from "../../../backend/league/history.mjs";
import { decryptState } from "../../../backend/shared/state-crypto.mjs";

test("default RATS history discovery starts at 1990 for broad archive coverage", () => {
  const ids = historySeasonIds(new Date("1991-06-01T12:00:00Z"));
  assert.equal(ids[0], "winter-1990");
  assert.equal(ids.at(-1), "fall-1992");
});

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

test("RATS history builder stores discovered public results only as encrypted runtime state", async (t) => {
  const oldKey = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-rats-history-test-key";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-rats-history-"));
  const file = path.join(dir, "history.json");

  t.after(() => {
    if (oldKey == null) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = oldKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const history = await refreshRatsHistory({
    now: new Date("2026-10-07T12:00:00Z"),
    startYear: 2026,
    file,
    force: true,
    callFn: async (_action, { season }) => {
      if (season !== "fall-2026") throw new Error("not published");
      return {
        teams: [
          {name: "Team Alpha", day: "Thursday", gender: "Men's", division: "1"},
          {name: "Team Beta", day: "Thursday", gender: "Men's", division: "1"},
        ],
        events: [{
          id: "match-1",
          start_date: "2026-10-01",
          start_time: "20:30:00",
          home_team_name: "Team Alpha",
          away_team_name: "Team Beta",
          home_score: 2,
          away_score: 1,
        }],
      };
    },
  });

  assert.equal(history.coverage.seasonCount, 1);
  assert.equal(history.coverage.completedMatchCount, 1);

  const raw = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(raw, /Team Alpha|Team Beta|fall-2026/);
  const decrypted = decryptState(JSON.parse(raw));
  assert.equal(decrypted.seasons[0].seasonId, "fall-2026");
  assert.equal(decrypted.seasons[0].matches[0].homeScore, 2);
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
