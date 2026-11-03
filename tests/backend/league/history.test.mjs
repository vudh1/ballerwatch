import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  HISTORY_BATCH_SIZE,
  HISTORY_REFRESH_MS,
  HISTORY_RETRY_MS,
  historyRefreshDue,
  historySeasonIds,
  normalizeHistoryAggregate,
  mergeVerifiedCurrentSeason,
  refreshRatsHistory,
} from "../../../backend/league/history.mjs";
import { decryptState, encryptState } from "../../../backend/shared/state-crypto.mjs";

test("default RATS history discovery uses the source-supported archive window recent-first", () => {
  const ids = historySeasonIds(new Date("2026-10-07T12:00:00Z"));
  assert.deepEqual(ids.slice(0, 4), [
    "fall-2026",
    "summer-2026",
    "spring-2026",
    "winter-2026",
  ]);
  assert.deepEqual(ids.slice(-2), [
    "fall-2023",
    "summer-2023",
  ]);
  assert.equal(ids.length, 14);
});

test("RATS history discovery scans every seasonal slug through the current year", () => {
  const ids = historySeasonIds(new Date("2026-10-07T12:00:00Z"), 2025);
  assert.deepEqual(ids.slice(0, 4), [
    "fall-2026",
    "summer-2026",
    "spring-2026",
    "winter-2026",
  ]);
  assert.deepEqual(ids.slice(-4), [
    "fall-2025",
    "summer-2025",
    "spring-2025",
    "winter-2025",
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
      schemaVersion: 3,
      updatedAt: now.toISOString(),
      coverage: {completedMatchCount: 0, complete: true},
    }, now),
    true,
  );
});

test("complete RATS results index refreshes hourly while partial coverage retries sooner", () => {
  assert.equal(HISTORY_REFRESH_MS, 60 * 60 * 1000);
  const now = new Date("2026-10-07T12:00:00Z");
  const complete = {
    schemaVersion: 3,
    updatedAt: new Date(now.getTime() - HISTORY_REFRESH_MS + 1).toISOString(),
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
    schemaVersion: 3,
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
      {name: "Team Alpha", day: "Thursday", gender: "Men's", division: "1",
        league_name: "Fall 2026 8v8"},
      {name: "Team Beta", day: "Thursday", gender: "Men's", division: "1",
        league: {name: "Fall 2026 11v11"}},
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
  assert.equal(season.teams.find(t=>t.name==="Team Alpha").leagueName,"Fall 2026 8v8");
  assert.equal(season.teams.find(t=>t.name==="Team Beta").leagueName,"Fall 2026 11v11");
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


test("verified current-season scores update standings without another archive fetch", async (t) => {
  const oldKey = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-rats-fast-standings-key";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-rats-fast-results-"));
  t.after(() => {
    if (oldKey == null) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = oldKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, "history.json");
  const live = path.join(dir, "verified-current.json");
  const flag = path.join(dir, "standings-changed.json");
  const now = new Date("2026-11-02T23:00:00Z");
  const aggregate = {
    teams: [
      { name: "Alpha", day: "Monday", gender: "Coed", division: "3" },
      { name: "Beta", day: "Monday", gender: "Coed", division: "3" },
    ],
    events: [{
      id: "match-1", start_date: "2026-11-01", start_time: "20:00:00",
      home_team_name: "Alpha", away_team_name: "Beta", score: "2-0",
    }],
  };
  const current = normalizeHistoryAggregate("fall-2026", aggregate);
  const previous = {
    schemaVersion: 3, updatedAt: "2026-11-01T22:00:00Z",
    coverage: { complete: true, requestedSeasonCount: 1, checkedSeasonCount: 1,
      completedMatchCount: 0, unresolvedSeasonIds: [] },
    scan: { pendingSeasonIds: [], checkedSeasonIds: ["fall-2026"],
      unresolvedSeasonIds: [], attemptCounts: {} },
    seasons: [{ ...current, matches: current.matches.map((match) => ({
      ...match, homeScore: null, awayScore: null,
    })) }],
  };
  fs.writeFileSync(file, JSON.stringify(encryptState(previous)));
  fs.writeFileSync(live, JSON.stringify({ schemaVersion: 1,
    seasonId: "fall-2026", season: current }));
  let calls = 0;
  const updated = await refreshRatsHistory({
    now, file, startYear: 2026, currentResultsFile: live, standingsFlagFile: flag,
    callFn: async () => { calls += 1; throw new Error("source not needed"); },
  });
  assert.equal(calls, 0, "a fresh validated aggregate should not trigger more provider traffic");
  assert.equal(updated.seasons[0].matches[0].homeScore, 2);
  assert.equal(updated.coverage.completedMatchCount, 1);
  assert.equal(updated.updatedAt, now.toISOString());
  assert.equal(fs.existsSync(flag), true);
  assert.equal(decryptState(JSON.parse(fs.readFileSync(file, "utf8"))).seasons[0]
    .matches[0].awayScore, 0);
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /Alpha|match-1/);
  const unchanged = mergeVerifiedCurrentSeason(updated, current, now);
  assert.equal(unchanged, null, "unchanged results must not bump the published timestamp");
});

test("historical source IDs survive public-sheet migration so current scores refresh", () => {
  const current = normalizeHistoryAggregate("fall-2026", {
    teams: [{ name: "Alpha", day: "Sunday", gender: "Coed", division: "3" },
      { name: "Beta", day: "Sunday", gender: "Coed", division: "3" }],
    events: [{ start_date: "2026-10-31", start_time: "20:00:00",
      home_team_name: "Alpha", away_team_name: "Beta", score: "4-2" }],
  });
  const legacy = { ...current, matches: current.matches.map((match) => ({
    ...match, id: "legacy-rats-source-417", homeScore: 3, awayScore: 2,
  })) };
  const old = {
    schemaVersion: 3, seasons: [legacy],
    coverage: { requestedSeasonCount: 1, checkedSeasonCount: 1, unresolvedSeasonIds: [] },
  };
  const updated = mergeVerifiedCurrentSeason(old, current,
    new Date("2026-11-02T23:00:00Z"));
  assert.equal(updated.seasons[0].matches[0].id, "legacy-rats-source-417");
  assert.equal(updated.seasons[0].matches[0].homeScore, 4);
  assert.equal(updated.seasons[0].matches[0].awayScore, 2);
  assert.equal(mergeVerifiedCurrentSeason(updated, current), null,
    "unchanged records must not reset the last-score timestamp");
});

test("partial RATS feeds cannot erase scored games or active team coverage", () => {
  const current = normalizeHistoryAggregate("fall-2026", {
    teams: [
      { name: "Alpha", day: "Monday", gender: "Coed", division: "3" },
      { name: "Beta", day: "Monday", gender: "Coed", division: "3" },
    ],
    events: [{ id: "match-1", start_date: "2026-10-31",
      home_team_name: "Alpha", away_team_name: "Beta", score: "3-2" }],
  });
  const history = {
    schemaVersion: 3, seasons: [current],
    coverage: { requestedSeasonCount: 1, checkedSeasonCount: 1, unresolvedSeasonIds: [] },
  };
  assert.equal(mergeVerifiedCurrentSeason(history, {
    ...current, matches: current.matches.map((match) => ({
      ...match, homeScore: null, awayScore: null,
    })),
  }), null);
  assert.equal(mergeVerifiedCurrentSeason(history, {
    ...current, teams: current.teams.slice(0, 1),
  }), null);
  assert.equal(mergeVerifiedCurrentSeason(history, {
    ...current, matches: [],
  }), null);
  const corrected = mergeVerifiedCurrentSeason(history, {
    ...current, matches: current.matches.map((match) => ({
      ...match, homeScore: 4, awayScore: 2,
    })),
  }, new Date("2026-11-02T23:00:00Z"));
  assert.equal(corrected.seasons[0].matches[0].homeScore, 4,
    "verified published score corrections must update standings");
});

test("history polling outage must not mislabel cached standings as freshly synced", async (t) => {
  const oldKey = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-rats-stale-results-key";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-rats-stale-results-"));
  t.after(() => {
    if (oldKey == null) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = oldKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, "history.json");
  const prior = {
    schemaVersion: 3, updatedAt: "2026-10-30T18:00:00Z",
    coverage: { completedMatchCount: 1, complete: true },
    scan: { pendingSeasonIds: [], checkedSeasonIds: [], unresolvedSeasonIds: [] },
    seasons: [{ seasonId: "fall-2026", teams: [{ name: "Alpha" }],
      matches: [{ id: "m", homeScore: 2, awayScore: 0 }] }],
  };
  fs.writeFileSync(file, JSON.stringify(encryptState(prior)));
  const after = await refreshRatsHistory({
    now: new Date("2026-11-02T23:00:00Z"), force: true, startYear: 2026,
    file, currentResultsFile: path.join(dir, "none.json"),
    standingsFlagFile: path.join(dir, "never.json"),
    callFn: async () => { throw new Error("ENOTFOUND source"); },
  });
  assert.equal(after.updatedAt, prior.updatedAt);
  assert.deepEqual(decryptState(JSON.parse(fs.readFileSync(file, "utf8"))), prior);
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
          score: "2-1",
        }],
      };
    },
  });

  assert.equal(history.schemaVersion, 3);
  assert.equal(history.coverage.seasonCount, 1);
  assert.equal(history.coverage.completedMatchCount, 1);
  assert.equal(history.coverage.complete, false);
  assert.equal(history.coverage.requestedSeasonCount, 4);
  assert.equal(history.coverage.checkedSeasonCount, 1);
  assert.equal(history.coverage.failedSeasonCount, 3);
  assert.deepEqual(history.scan.checkedSeasonIds, ["fall-2026"]);
  assert.equal(history.scan.pendingSeasonIds.length, 3);
  assert.equal(HISTORY_BATCH_SIZE, 4);

  const raw = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(raw, /Team Alpha|Team Beta|fall-2026/);
  const decrypted = decryptState(JSON.parse(raw));
  assert.equal(decrypted.seasons[0].seasonId, "fall-2026");
  assert.equal(decrypted.seasons[0].matches[0].homeScore, 2);
});

test("RATS history crawler advances pending seasons across runs without bursting", async (t) => {
  const oldKey = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-rats-history-crawler-key";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-rats-crawler-"));
  const file = path.join(dir, "history.json");
  const calls = [];

  t.after(() => {
    if (oldKey == null) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = oldKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const callFn = async (_action, { season }) => {
    calls.push(season);
    return {
      teams: [
        {name: "Team Alpha", day: "Thursday", gender: "Men's", division: "1"},
        {name: "Team Beta", day: "Thursday", gender: "Men's", division: "1"},
      ],
      events: [{
        id: season,
        start_date: `${season.endsWith("2026") ? "2026" : "2025"}-10-01`,
        start_time: "20:30:00",
        home_team_name: "Team Alpha",
        away_team_name: "Team Beta",
        score: "3-2",
      }],
    };
  };

  const first = await refreshRatsHistory({
    now: new Date("2026-10-07T12:00:00Z"),
    startYear: 2025,
    file,
    force: true,
    callFn,
  });
  assert.equal(calls.length, 4);
  assert.equal(first.coverage.seasonCount, 4);
  assert.equal(first.scan.pendingSeasonIds.length, 4);

  const second = await refreshRatsHistory({
    now: new Date("2026-10-07T12:05:00Z"),
    startYear: 2025,
    file,
    callFn,
  });
  assert.equal(calls.length, 8);
  assert.equal(second.coverage.seasonCount, 8);
  assert.equal(second.scan.pendingSeasonIds.length, 0);
  assert.equal(second.coverage.complete, true);
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
