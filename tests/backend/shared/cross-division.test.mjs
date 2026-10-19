/**
 * Cross-division fixture regressions use only synthetic public league data.
 * No account, subscription, live API or notification side effects.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHistoryAggregate } from "../../../backend/league/history.mjs";
import {
  buildLeagueStandings, buildMatchupEstimate, buildTeamRecentForm, buildTeamScout,
} from "../../../backend/shared/league-standings.mjs";
import {
  opponentTierWeight, forecastFromFeatures,
} from "../../../backend/shared/scout-calibration.mjs";

const team = (name, division) => ({
  name, day: "Tuesday", gender: "Men", division,
  league_name: "Fall 2026 11v11",
});
const score = (id, date, home, away, a, b) => ({
  id, start_date: date, start_time: "20:00",
  home_team_name: home, away_team_name: away,
  ...(a != null && b != null ? { score: `${a}-${b}` } : {}),
});
const result = (date, homeTeam, awayTeam, homeScore, awayScore) => ({
  date, homeTeam, awayTeam, homeScore, awayScore,
});
const makeHistory = () => {
  const season = normalizeHistoryAggregate("fall-2026", {
    teams: [
      team("Top Blue", "1"), team("Top Red", "1"),
      team("Mid Gold", "2"), team("Mid Silver", "2"),
      team("Low Grey", "3"), team("Low Black", "3"),
    ],
    events: [
      score(1, "2026-10-01", "Top Blue", "Mid Gold", 3, 1),
      score(2, "2026-10-02", "Mid Silver", "Top Red", 0, 0),
      score(3, "2026-10-03", "Low Grey", "Mid Gold", 2, 3),
      score(4, "2026-10-04", "Mid Silver", "Low Black", 2, 0),
      score(5, "2026-10-05", "Top Blue", "Top Red", 1, 2),
      score(6, "2026-10-06", "Mid Gold", "Mid Silver", 2, 1),
      score(7, "2026-10-07", "Low Black", "Top Red", null, null),
      score(8, "2026-10-21", "Top Blue", "Mid Gold", 9, 0),
    ],
  });
  return { seasons: [season], updatedAt: "2026-10-13T12:00:00Z",
    coverage: { complete: true } };
};
const rowFor = (card, name) => card.rows.find((row) => row.name === name);

test("source history keeps interdivision scored events exactly once", () => {
  const season = makeHistory().seasons[0];
  assert.equal(season.teams.length, 6);
  assert.equal(season.matches.length, 8);
  assert.equal(season.matches[0].homeTeam, "Top Blue");
  assert.equal(season.matches[0].awayTeam, "Mid Gold");
  assert.deepEqual([season.matches[0].homeScore, season.matches[0].awayScore], [3, 1]);
});

test("a cross-division result counts on both sides, but never adds foreign clubs to a division table", () => {
  const history = makeHistory();
  const standings = buildLeagueStandings(history, "fall-2026",
    ["Top Blue", "Mid Gold", "Low Grey"], "2026-10-13");
  const [d1, d2, d3] = standings.cards;
  assert.deepEqual(d1.rows.map((r) => r.name), ["Top Red", "Top Blue"]);
  assert.deepEqual(d2.rows.map((r) => r.name), ["Mid Gold", "Mid Silver"]);
  assert.deepEqual(d3.rows.map((r) => r.name).sort(), ["Low Black", "Low Grey"]);
  assert.deepEqual(
    [rowFor(d1, "Top Blue").played, rowFor(d1, "Top Blue").points,
      rowFor(d1, "Top Blue").wins, rowFor(d1, "Top Blue").losses],
    [2, 3, 1, 1],
  );
  assert.deepEqual(
    [rowFor(d2, "Mid Gold").played, rowFor(d2, "Mid Gold").points,
      rowFor(d2, "Mid Gold").goalsFor, rowFor(d2, "Mid Gold").goalsAgainst],
    [3, 6, 6, 6],
  );
  assert.deepEqual(
    [rowFor(d2, "Mid Silver").played, rowFor(d2, "Mid Silver").points,
      rowFor(d2, "Mid Silver").draws],
    [3, 4, 1],
  );
  assert.deepEqual([rowFor(d3, "Low Grey").played, rowFor(d3, "Low Grey").losses],
    [1, 1]);
  assert.equal(rowFor(d1, "Top Red").played, 2, "cross-division draw counts once");
  assert.equal(standings.cards[1].rows.some((r) => r.name === "Top Blue"), false);
});

test("scouting current record, last-ten form, history, and matchup include interdivision fixtures", () => {
  const history = makeHistory();
  const scout = buildTeamScout(history, "fall-2026", "Mid Gold", "2026-10-13");
  assert.deepEqual([scout.current.played, scout.current.wins, scout.current.losses],
    [3, 2, 1]);
  assert.equal(scout.overall.games, 3);
  assert.equal(scout.recentTen.games, 3);
  assert.equal(scout.quality.games, 3);
  const form = buildTeamRecentForm(history, "Mid Gold", "2026-10-13");
  assert.equal(form.games, 3);
  const estimate = buildMatchupEstimate(history, "Mid Gold", "Top Blue", "2026-10-13");
  assert.equal(estimate.teamGames, 3);
  assert.equal(estimate.opponentGames, 2);
  assert.equal(estimate.headToHeadGames, 1);
  assert.equal(estimate.winPct + estimate.drawPct + estimate.lossPct, 100);
});

test("future, unscored, unknown and duplicate-name fixtures cannot pollute standings", () => {
  const history = makeHistory();
  const season = history.seasons[0];
  season.matches.push(result("2026-10-04", "Mid Gold", "Unregistered", 8, 0));
  season.teams.push({ name: "Sitting Ducks", day: "Tuesday", gender: "Men", division: "1" },
    { name: "Sitting Ducks", day: "Tuesday", gender: "Men", division: "2" });
  season.matches.push(result("2026-10-05", "Sitting Ducks", "Mid Gold", 7, 0));
  const cards = buildLeagueStandings(history, "fall-2026",
    ["Mid Gold", "Top Blue"], "2026-10-13").cards;
  assert.equal(rowFor(cards[0], "Mid Gold").played, 3);
  assert.equal(rowFor(cards[0], "Mid Gold").goalsAgainst, 6);
  assert.equal(rowFor(cards[1], "Top Blue").played, 2);
});

test("scouting opponent-tier weighting favors beating a higher division, bounded for thin histories", () => {
  assert.equal(opponentTierWeight(1.1, 1.1), 1);
  assert.ok(opponentTierWeight(1.1, 1.3) > 1);
  assert.ok(opponentTierWeight(1.1, 0.9) < 1);
  assert.equal(opponentTierWeight(0, 1.3), 1);
  assert.equal(opponentTierWeight(1.1, NaN), 1);
  const make = (beatStrong) => ({
    seasons: [{ seasonId: "fall-2026",
      teams: [team("Middle", "2"), team("Strong", "1"), team("Weak", "3"),
        team("Rival", "2")].map((t) => ({
          name: t.name, division: t.division, day: t.day, gender: t.gender,
          leagueName: "Fall 2026 11v11",
        })),
      matches: [
        result("2026-10-01", "Middle", "Strong", beatStrong ? 2 : 0, beatStrong ? 0 : 2),
        result("2026-10-01", "Middle", "Weak", beatStrong ? 0 : 2, beatStrong ? 2 : 0),
        result("2026-10-02", "Rival", "Strong", 1, 1),
      ],
    }],
  });
  const strongWin = buildTeamRecentForm(make(true), "Middle", "2026-10-13");
  const weakWin = buildTeamRecentForm(make(false), "Middle", "2026-10-13");
  assert.equal(strongWin.games, 2);
  assert.ok(strongWin.weightedWinPct > weakWin.weightedWinPct,
    "beating D1 outweighs beating D3 at equal recency");
  const quality = buildTeamScout(make(true), "fall-2026", "Middle", "2026-10-13");
  assert.equal(quality.quality.games, 2);
  const form = (opponentTier) => [{
    date: "2026-10-01", scored: 2, conceded: 0,
    tier: 1.1, opponentTier, format: "11v11",
  }, {
    date: "2026-10-02", scored: 0, conceded: 2,
    tier: 1.1, opponentTier: 1.1, format: "11v11",
  }];
  const rival = form(1.1).map((row) => ({
    ...row, scored: row.conceded, conceded: row.scored,
  }));
  const high = forecastFromFeatures(form(1.3), rival, []);
  const low = forecastFromFeatures(form(0.9), rival, []);
  assert.ok(high.win > low.win, "three-way model uses opposing division tier");
});
