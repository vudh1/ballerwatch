import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  HISTORY_REFRESH_MS,
  HISTORY_RETRY_MS,
  historyRefreshDue,
  historySeasonIds,
  normalizeHistoryAggregate,
  refreshRatsHistory,
} from "../../../backend/league/history.mjs";
import { decryptState } from "../../../backend/shared/state-crypto.mjs";

test("default RATS history discovery uses the source-supported archive window", () => {
  const ids = historySeasonIds(new Date("2026-10-07T12:00:00Z"));
  assert.equal(ids[0], "winter-2023");
  assert.equal(ids.at(-1), "fall-2026");
  assert.equal(ids.length, 16);
});

test("RATS history discovery scans every seasonal slug through the current year", () => {
  const ids = historySeasonIds(new Date("2026-10-07T12:00:00Z"), 2025);
  assert.deepEqual(ids.slice(0, 4), [
    "winter-2025",
    "spring-2025",
    "summer-2025",
    "fall-2025",
  ]);
  assert.deepEqual(ids.slice(-4), [
    "winter-2026",
    "spring-2026",
    "summer-2026",
    "fall-2026",
  ]);
  assert.equal(ids.length, 8);
});

test("RATS history refresh repairs legacy and zero-score archives immediately", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  assert.equal(historyRefreshDue(null, now), true);
  assert.equal(
    historyRefreshDue({
      schemaVersion: 1,
      updatedAt: now.toISOString(),
      coverage: {completedMatchCount: 10, complete: true},
    }, now),
    true,
  );
  assert.equal(
    historyRefreshDue({
      schemaVersion: 2,
      updatedAt: now.toISOString(),
      coverage: {completedMatchCount: 0, complete: true},
    }, now),
    true,
  );
});

test("complete RATS history refreshes daily while partial coverage retries sooner", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const complete = {
    schemaVersion: 2,
    updatedAt: "2026-10-07T00:01:00Z",
    coverage: {completedMatchCount: 100, complete: true},
  };
  assert.equal(historyRefreshDue(complete, now), false);
  assert.equal(
    historyRefreshDue({
      ...complete,
      updatedAt: new Date(now.getTime() - HISTORY_REFRESH_MS - 1).toISOString(),
    }, now),
    true,
  );

  const partial = {
    schemaVersion: 2,
    updatedAt: new Date(now.getTime() - HISTORY_RETRY_MS + 1).toISOString(),
    coverage: {completedMatchCount: 100, complete: false},
  };
  assert.equal(historyRefreshDue(partial, now), false);
  assert.equal(
    historyRefreshDue({
      ...partial,
      updatedAt: new Date(now.getTime() - HISTORY_RETRY_MS - 1).toISOString(),
    }, now),
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
        score: "4-2",
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
    normalizeHistoryAggregate("winter-2023", {teams: [], events: []}),
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

  assert.equal(history.schemaVersion, 2);
  assert.equal(history.coverage.seasonCount, 1);
  assert.equal(history.coverage.completedMatchCount, 1);
  assert.equal(history.coverage.complete, false);
  assert.equal(history.coverage.requestedSeasonCount, 4);
  assert.equal(history.coverage.failedSeasonCount, 3);

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
