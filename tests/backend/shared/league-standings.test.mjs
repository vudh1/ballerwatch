import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLeagueStandings,
  buildLeagueTeamHistory,
} from "../../../backend/shared/league-standings.mjs";

function archive() {
  return {
    updatedAt: "2026-10-13T12:00:00Z",
    coverage: { complete: false, seasonCount: 2, requestedSeasonCount: 3 },
    seasons: [
      {
        seasonId: "fall-2025",
        label: "Fall 2025",
        teams: [
          { name: "Third Touch FC", day: "Tuesday", gender: "Men", division: "2" },
          { name: "Old Opponent", day: "Tuesday", gender: "Men", division: "2" },
        ],
        matches: [
          { date: "2025-10-02", homeTeam: "Old Opponent", awayTeam: "Third Touch FC",
            homeScore: 0, awayScore: 2 },
        ],
      },
      {
        seasonId: "fall-2026",
        label: "Fall 2026",
        teams: [
          { name: "Third Touch FC", day: "Tuesday", gender: "Men", division: "2" },
          { name: "Other A", day: "Tuesday", gender: "Men", division: "2" },
          { name: "Other B", day: "Tuesday", gender: "Men", division: "2" },
          { name: "PhoSaiGon", day: "Wednesday", gender: "Coed", division: "1" },
          { name: "Other C", day: "Wednesday", gender: "Coed", division: "1" },
        ],
        matches: [
          { date: "2026-10-01", homeTeam: "Third Touch FC", awayTeam: "Other A",
            homeScore: 2, awayScore: 0 },
          { date: "2026-10-08", homeTeam: "Other B", awayTeam: "Third Touch FC",
            homeScore: 1, awayScore: 1 },
          { date: "2026-10-09", homeTeam: "PhoSaiGon", awayTeam: "Other C",
            homeScore: 3, awayScore: 2 },
          { date: "2026-10-10", homeTeam: "Other B", awayTeam: "Other A",
            homeScore: null, awayScore: null },
          { date: "2026-10-20", homeTeam: "Other A", awayTeam: "Third Touch FC",
            homeScore: 9, awayScore: 0 },
          { date: "2026-10-11", homeTeam: "Other A", awayTeam: "Other C",
            homeScore: 1, awayScore: 9 },
        ],
      },
    ],
  };
}

test("each monitored team gets standings only for its own current-season division", () => {
  const view = buildLeagueStandings(
    archive(), "fall-2026", ["Third Touch FC", "PhoSaiGon"], "2026-10-13",
  );
  assert.equal(view.cards.length, 2);
  assert.equal(view.season, "Fall 2026");
  assert.equal(view.official, false);
  assert.match(view.method, /3 points per win/);
  assert.equal(view.cards[0].division, "Tuesday Men D-2");
  assert.equal(view.cards[1].division, "Wednesday Coed D-1");
  assert.deepEqual(view.cards[0].rows.map((row) => row.name),
    ["Third Touch FC", "Other B", "Other A"]);
  assert.deepEqual(view.cards[1].rows.map((row) => row.name),
    ["PhoSaiGon", "Other C"]);
  const tracked = view.cards[0].rows[0];
  assert.deepEqual(
    [tracked.played, tracked.wins, tracked.draws, tracked.losses,
      tracked.goalsFor, tracked.goalsAgainst, tracked.goalDifference, tracked.points],
    [2, 1, 1, 0, 3, 1, 2, 4],
  );
  assert.equal(tracked.highlighted, true);
  assert.equal(view.cards[0].rows[1].highlighted, false);
  assert.equal(view.cards[1].rows[0].highlighted, true);
});

test("club names with an FC suffix may match tracked names without falsely merging divisions", () => {
  const view = buildLeagueStandings(
    archive(), "fall-2026", ["Third Touch", "phosaigon"], "2026-10-13",
  );
  assert.equal(view.cards[0].team, "Third Touch FC");
  assert.equal(view.cards[1].team, "PhoSaiGon");
  assert.ok(view.cards.every((card) => card.ready));
});

test("missing current season never reuses previous season standings", () => {
  const view = buildLeagueStandings(
    archive(), "winter-2027", ["Third Touch FC"], "2026-10-13",
  );
  assert.equal(view.cards[0].ready, false);
  assert.deepEqual(view.cards[0].rows, []);
  assert.match(view.cards[0].message, /not been indexed/);
});

test("team history shows completed games across indexed seasons, latest first", () => {
  const history = buildLeagueTeamHistory(
    archive(), "fall-2026", "Third Touch FC", 20, "2026-10-13",
  );
  assert.equal(history.team, "Third Touch FC");
  assert.equal(history.coverageComplete, false);
  assert.equal(history.indexedMatchCount, 3);
  assert.deepEqual(history.matches.map((item) => item.result), ["D", "W", "W"]);
  assert.deepEqual(history.matches.map((item) => item.season),
    ["Fall 2026", "Fall 2026", "Fall 2025"]);
  assert.ok(history.matches.every((item) => item.date <= "2026-10-13"));
});

test("match history rejects teams outside the current-season roster", () => {
  assert.equal(buildLeagueTeamHistory(archive(), "fall-2026", "Old Opponent"), null);
  assert.equal(buildLeagueTeamHistory(archive(), "winter-2027", "Third Touch FC"), null);
});

test("no recorded score does not imply a 0-0 draw", () => {
  const view = buildLeagueStandings(archive(), "fall-2026", ["Other B"], "2026-10-13");
  const row = view.cards[0].rows.find((item) => item.name === "Other B");
  assert.equal(row.played, 1);
  assert.equal(row.draws, 1);
  assert.equal(row.points, 1);
});

test("attacking/defending rankings use per-game rates in the correct direction", () => {
  const data = archive();
  // Third Touch: 3 GF in two matches, 1 GA -> 1.5 and 0.5 goals/game.
  const view = buildLeagueStandings(data, "fall-2026", ["Third Touch FC"], "2026-10-13");
  const stats = view.cards[0].stats;
  assert.deepEqual(stats.attack, { rank: 1, total: 2, perGame: 1.5, goals: 3 });
  assert.deepEqual(stats.defense, { rank: 1, total: 2, perGame: 0.5, goals: 1 });
  assert.equal(stats.previousSeason, null);
  assert.equal(stats.previousSeasonLabel, "Summer 2026");
  assert.equal(stats.archiveComplete, false);
});

test("previous season rank is unavailable when the immediate prior season is missing", () => {
  const data = archive();
  const view = buildLeagueStandings(data, "fall-2026", ["PhoSaiGon"], "2026-10-13");
  assert.equal(view.cards[0].stats.previousSeason, null);
  // Never label Fall 2025 as the 'last season' of Fall 2026.
  assert.equal(view.cards[0].stats.previousSeasonLabel, "Summer 2026");
});

test("previous season placement is calculated only from that season's division", () => {
  const data = archive();
  data.seasons.push({
    seasonId: "summer-2026",
    label: "Summer 2026",
    teams: [
      { name: "Third Touch FC", day: "Thursday", gender: "Coed", division: "4" },
      { name: "Previous Opponent", day: "Thursday", gender: "Coed", division: "4" },
      { name: "Unrelated Club", day: "Tuesday", gender: "Men", division: "2" },
    ],
    matches: [
      { date: "2026-06-20", homeTeam: "Previous Opponent", awayTeam: "Third Touch FC",
        homeScore: 2, awayScore: 0 },
    ],
  });
  const stats = buildLeagueStandings(
    data, "fall-2026", ["Third Touch FC"], "2026-10-13",
  ).cards[0].stats;
  assert.deepEqual(stats.previousSeason, {
    rank: 2, total: 2, label: "Summer 2026",
    division: "Thursday Coed D-4", matches: 1,
  });
});

test("unscored current division leaves ranking stats unavailable", () => {
  const data = archive();
  for (const match of data.seasons[1].matches) {
    match.homeScore = null;
    match.awayScore = null;
  }
  const stats = buildLeagueStandings(data, "fall-2026", ["Third Touch FC"], "2026-10-13")
    .cards[0].stats;
  assert.equal(stats.attack, null);
  assert.equal(stats.defense, null);
});
