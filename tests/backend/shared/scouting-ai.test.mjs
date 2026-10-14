import test from "node:test";
import assert from "node:assert/strict";
import { answerScoutingQuestion, isScoutingQuestion } from
  "../../../backend/shared/scouting-ai.mjs";

function prepared() {
  const scout = (division, rating, rank, wins) => ({
    season: "Fall 2026", division, current: { wins: 2, draws: 1, losses: 1 },
    quality: { index: rating, rank, total: 6, games: 10 },
    recentTen: { games: 10, weightedWinPct: wins },
    attack: { games: 10, perGame: 2.1, rank: 2, total: 6 },
    defense: { games: 10, perGame: 1.2, rank: 1, total: 6 },
    overall: { games: 20, wins: 12, draws: 3, losses: 5 },
    archiveComplete: true,
  });
  return {
    schemaVersion: 2,
    standings: { matchups: {
      fixture: {
        team: "Third Touch FC", opponent: "Sitting Ducks",
        winPct: 45, drawPct: 20, lossPct: 35,
        teamGames: 10, opponentGames: 10,
        headToHeadGames: 3, sampleLimited: false,
      },
    }},
    reports: {
      [JSON.stringify(["tue|men|2", "Third Touch FC"])]: {
        matches: [], scout: scout("Tuesday Men D2", 76, 2, 60),
      },
      [JSON.stringify(["tue|men|2", "Sitting Ducks"])]: {
        matches: [], scout: scout("Tuesday Men D2", 67, 3, 50),
      },
    },
  };
}

test("only scouting prompts enter the prepared scout adapter", () => {
  assert.equal(isScoutingQuestion("What is Sitting Ducks recent form?"), true);
  assert.equal(isScoutingQuestion("How likely to win is our team?"), true);
  assert.equal(isScoutingQuestion("Compare two teams' attack and defense"), true);
  assert.equal(isScoutingQuestion("Who do we play on Tuesday?"), false);
  assert.equal(answerScoutingQuestion("Who do we play on Tuesday?", prepared()), null);
});

test("scouting questions use prepared last-ten quality, attack, defense and all-time stats", () => {
  const answer = answerScoutingQuestion("Scout Sitting Ducks", prepared());
  assert.equal(answer.ok, true);
  assert.equal(answer.intent, "league_scout");
  assert.match(answer.reply, /Opponent-adjusted form: 67\/100/);
  assert.match(answer.reply, /Last 10 scored games: 50%/);
  assert.match(answer.reply, /Attack \(last 10\): 2\.1/);
  assert.match(answer.reply, /Defense \(last 10\): 1\.2/);
  assert.match(answer.reply, /12W–3D–5L/);
  assert.deepEqual(answer.historyTeams, ["Sitting Ducks"]);
  assert.doesNotMatch(JSON.stringify(answer), /rsvpName|players|waitlist/);
});

test("win odds are only quoted when a published matchup projection exists", () => {
  const index = prepared();
  const match = answerScoutingQuestion(
    "What is the win chance for Third Touch FC vs Sitting Ducks?", index);
  assert.equal(match.ok, true);
  assert.match(match.reply, /Win ~45% · Draw ~20% · Loss ~35%/);
  assert.match(match.reply, /not calibrated betting odds/);
  const comparison = answerScoutingQuestion(
    "Compare Third Touch FC and Sitting Ducks form", index);
  assert.equal(comparison.ok, true);
  assert.match(comparison.reply, /Opponent-adjusted form: 76\/100/);
  assert.match(comparison.reply, /Opponent-adjusted form: 67\/100/);
  const noChance = answerScoutingQuestion("What is some new team's win chance?", index);
  assert.equal(noChance.ok, false);
  assert.match(noChance.error, /missing predictions are not invented/);
});

test("new upcoming match questions cannot silently reuse older team context", () => {
  const answer = answerScoutingQuestion(
    "What is the win chance for the next monitored matchup?", prepared(),
    { contextTeams: ["Sitting Ducks"] });
  assert.equal(answer.ok, true);
  assert.match(answer.reply, /Third Touch FC vs Sitting Ducks/);
  assert.match(answer.reply, /Win ~45%/);
});

test("same-named division peers cannot be silently conflated", () => {
  const index = prepared();
  index.reports[JSON.stringify(["wed|coed|1", "Sitting Ducks"])] = {
    matches: [], scout: {
      ...index.reports[JSON.stringify(["tue|men|2", "Sitting Ducks"])].scout,
      division: "Wednesday Coed D1",
    },
  };
  const ambiguous = answerScoutingQuestion("Scout Sitting Ducks", index);
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.error, /Specify the division/);
  const selected = answerScoutingQuestion("Scout Sitting Ducks in Tuesday Men D2", index);
  assert.equal(selected.ok, true);
  assert.match(selected.reply, /Tuesday Men D2/);
});

test("a follow-up can reuse validated team context without inventing an opponent", () => {
  const index = prepared();
  index.standings.matchups = {};
  const answer = answerScoutingQuestion("How is their defense?", index, {
    contextTeams: ["Sitting Ducks"],
  });
  assert.equal(answer.ok, true);
  assert.match(answer.reply, /Defense \(last 10\)/);
  assert.equal(answerScoutingQuestion("Show the win chance for an unpublished match", index).ok, false);
});

test("BallerWatch AI reports only published out-of-sample scouting metrics", () => {
  const index = prepared();
  index.model = {
    modelVersion: 1,
    status: "baseline-retained",
    evaluatedGames: 140,
    trainedFolds: 4,
    nextSeasonBrier: 0.616,
    baselineNextSeasonBrier: 0.615,
    qualityNextSeasonCorrelation: 0.23,
    qualityTeamPairs: 26,
  };
  const answer = answerScoutingQuestion("How accurate is the scouting model?", index);
  assert.equal(answer.ok, true);
  assert.match(answer.reply, /baseline retained/);
  assert.match(answer.reply, /140 scored fixtures/);
  assert.match(answer.reply, /0.616/);
  assert.match(answer.reply, /0.615 baseline/);
  assert.match(answer.reply, /correlation: 0.23/);
  const missing = answerScoutingQuestion("Scouting model calibration?", prepared());
  assert.equal(missing.ok, true);
  assert.match(missing.reply, /validation sample is not yet available/);
});
