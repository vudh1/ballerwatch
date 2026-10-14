import test from "node:test";
import assert from "node:assert/strict";
import { buildScoutingIndex, scoutReportId } from
  "../../../backend/league/scouting-index.mjs";

function history() {
  return {
    updatedAt: "2026-10-13T16:00:00Z",
    coverage: { complete: true },
    seasons: [{
      seasonId: "fall-2026", label: "Fall 2026",
      teams: [
        { name: "Tracked FC", day: "Tuesday", gender: "Men", division: "2",
          leagueName: "Fall 11v11" },
        { name: "Sitting Ducks", day: "Tuesday", gender: "Men", division: "2",
          leagueName: "Fall 11v11" },
      ],
      matches: [
        { date: "2026-10-01", homeTeam: "Tracked FC", awayTeam: "Sitting Ducks",
          homeScore: 3, awayScore: 1 },
      ],
    }],
  };
}

test("the hourly projection includes quick standings, forecasts and full scout payloads", () => {
  const league = {
    seasonId: "fall-2026",
    teams: [{
      name: "Tracked FC", matches: [{
        date: "2026-10-20", team: "Tracked FC", opponent: "Sitting Ducks",
      }],
    }],
  };
  const index = buildScoutingIndex({
    history: history(), league, teams: ["Tracked FC"], today: "2026-10-13",
    generatedAt: "2026-10-13T17:00:00Z",
  });
  assert.equal(index.schemaVersion, 2);
  assert.deepEqual(index.teamOptions, ["Sitting Ducks", "Tracked FC"]);
  assert.equal(index.seasonId, "fall-2026");
  assert.equal(index.updatedAt, "2026-10-13T16:00:00Z");
  assert.deepEqual(index.monitoredTeams, ["Tracked FC"]);
  assert.equal(index.standings.cards.length, 1);
  const division = index.standings.cards[0].divisionKey;
  assert.equal(index.standings.cards[0].rows.length, 2);
  assert.equal(Object.keys(index.reports).length, 2);
  assert.equal(index.reports[scoutReportId(division, "Sitting Ducks")].scout.overall.losses, 1);
  assert.equal(index.reports[scoutReportId(division, "Tracked FC")].matches.length, 1);
  assert.ok(index.standings.matchups["tracked|sitting duck"] || Object.values(
    index.standings.matchups,
  ).length);
});

test("empty current-season archive cannot produce fictitious scouting history", () => {
  const index = buildScoutingIndex({
    history: { seasons: [], updatedAt: "" },
    league: { seasonId: "winter-2027", teams: [] },
    teams: ["Tracked FC"], today: "2027-01-01",
  });
  assert.equal(index.standings.cards[0].ready, false);
  assert.deepEqual(index.reports, {});
  assert.deepEqual(index.teamOptions, ["Tracked FC"]);
});
