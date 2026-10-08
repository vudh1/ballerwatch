import test from "node:test";
import assert from "node:assert/strict";

import {
  answerRatsHistoryQuestion,
  historyHeadToHead,
  historyRecord,
  historySeasonFromQuestion,
  historyTeamsInQuestion,
} from "../../../backend/shared/rats-history.mjs";

function historyFixture() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-10-07T00:00:00Z",
    coverage: {
      complete: true,
      requestedSeasonCount: 2,
      seasonCount: 2,
      completedMatchCount: 3,
      firstSeason: "fall-2024",
      lastSeason: "spring-2025",
    },
    seasons: [
      {
        seasonId: "fall-2024",
        label: "Fall 2024",
        teams: [
          { name: "Team Alpha" },
          { name: "Team Beta" },
          { name: "Team Gamma" },
        ],
        matches: [
          {
            date: "2024-09-01",
            homeTeam: "Team Alpha",
            awayTeam: "Team Beta",
            homeScore: 3,
            awayScore: 1,
          },
          {
            date: "2024-09-08",
            homeTeam: "Team Gamma",
            awayTeam: "Team Alpha",
            homeScore: 2,
            awayScore: 2,
          },
        ],
      },
      {
        seasonId: "spring-2025",
        label: "Spring 2025",
        teams: [
          { name: "Team Alpha" },
          { name: "Team Beta" },
        ],
        matches: [
          {
            date: "2025-04-01",
            homeTeam: "Team Beta",
            awayTeam: "Team Alpha",
            homeScore: 2,
            awayScore: 0,
          },
          {
            date: "2025-04-15",
            homeTeam: "Team Alpha",
            awayTeam: "Team Beta",
            homeScore: null,
            awayScore: null,
          },
        ],
      },
    ],
  };
}

test("RATS historical record counts only scored matches across seasons", () => {
  const record = historyRecord(historyFixture(), "Team Alpha");
  assert.equal(record.games, 3);
  assert.equal(record.wins, 1);
  assert.equal(record.draws, 1);
  assert.equal(record.losses, 1);
  assert.equal(record.goalsFor, 5);
  assert.equal(record.goalsAgainst, 5);
  assert.deepEqual(record.seasons, ["fall-2024", "spring-2025"]);
});

test("RATS history can scope a record to one named season", () => {
  assert.equal(historySeasonFromQuestion("Team Alpha record in Fall 2024"), "fall-2024");
  const record = historyRecord(historyFixture(), "Team Alpha", "fall-2024");
  assert.deepEqual(
    [record.games, record.wins, record.draws, record.losses],
    [2, 1, 1, 0],
  );
});

test("RATS head-to-head returns prior meetings from either home side", () => {
  const h2h = historyHeadToHead(historyFixture(), "Team Alpha", "Team Beta");
  assert.equal(h2h.matches.length, 2);
  assert.equal(h2h.winsA, 1);
  assert.equal(h2h.winsB, 1);
  assert.equal(h2h.draws, 0);
});

test("bot answers all-time record and previous-meeting questions deterministically", () => {
  const record = answerRatsHistoryQuestion(
    "what is the record of Team Alpha?",
    historyFixture(),
  );
  assert.match(record.reply, /Team Alpha — all discoverable RATS seasons \(Fall 2024–Spring 2025\)/);
  assert.match(record.reply, /1-1-1 \(W-D-L\)/);

  const h2h = answerRatsHistoryQuestion(
    "has Team Alpha played Team Beta before?",
    historyFixture(),
  );
  assert.match(h2h.reply, /2 meetings/);
  assert.match(h2h.reply, /Team Alpha 1W/);
  assert.match(h2h.reply, /Team Beta 1W/);
  assert.match(h2h.reply, /Spring 2025/);
});

test("partial RATS history never presents an indexed record as all-time", () => {
  const partial = historyFixture();
  partial.coverage = {
    ...partial.coverage,
    complete: false,
    requestedSeasonCount: 8,
    seasonCount: 2,
    failedSeasonCount: 6,
  };
  const answer = answerRatsHistoryQuestion(
    "what is the all-time record of Team Alpha?",
    partial,
  );
  assert.equal(answer.ready, true);
  assert.match(answer.reply, /History index is still rebuilding/);
  assert.match(answer.reply, /2\/8 seasons/);
  assert.match(answer.reply, /partial/);
  assert.doesNotMatch(answer.reply, /all-time record:/i);
});

test("zero-score RATS archives fail closed instead of returning a fake zero record", () => {
  const broken = historyFixture();
  broken.coverage.completedMatchCount = 0;
  broken.seasons = broken.seasons.map((season) => ({
    ...season,
    matches: season.matches.map((match) => ({
      ...match,
      homeScore: null,
      awayScore: null,
    })),
  }));
  const answer = answerRatsHistoryQuestion(
    "what is the record of Team Alpha?",
    broken,
  );
  assert.equal(answer.ready, false);
  assert.match(answer.reply, /historical scores are rebuilding/i);
});

test("bot preserves the last historical team for follow-up record questions", () => {
  assert.deepEqual(
    historyTeamsInQuestion("what is their record?", historyFixture(), ["Team Alpha"]),
    ["Team Alpha"],
  );
  const answer = answerRatsHistoryQuestion(
    "what is their record?",
    historyFixture(),
    ["Team Alpha"],
  );
  assert.match(answer.reply, /1-1-1/);
  assert.deepEqual(answer.teams, ["Team Alpha"]);
});

test("bot can list the indexed seasons for a team", () => {
  const answer = answerRatsHistoryQuestion(
    "what seasons did Team Alpha play?",
    historyFixture(),
  );
  assert.match(answer.reply, /2 indexed RATS seasons/);
  assert.match(answer.reply, /Fall 2024/);
  assert.match(answer.reply, /Spring 2025/);
});

test("unknown historical teams fail closed with bounded suggestions", () => {
  const answer = answerRatsHistoryQuestion(
    "what is Team Delta record?",
    historyFixture(),
  );
  assert.match(answer.reply, /couldn't match a RATS team name/i);
  assert.deepEqual(answer.teams, []);
});

test("shortened FC club names resolve and aggregate scores across variants", () => {
  const history = historyFixture();
  history.seasons[0].teams[0].name = "Seattle Bros FC";
  history.seasons[1].teams[0].name = "Seattle Bros";
  for (const match of history.seasons[0].matches) {
    if (match.homeTeam === "Team Alpha") match.homeTeam = "Seattle Bros FC";
    if (match.awayTeam === "Team Alpha") match.awayTeam = "Seattle Bros FC";
  }
  for (const match of history.seasons[1].matches) {
    if (match.homeTeam === "Team Alpha") match.homeTeam = "Seattle Bros";
    if (match.awayTeam === "Team Alpha") match.awayTeam = "Seattle Bros";
  }
  assert.deepEqual(historyTeamsInQuestion("Seattle Bros record?", history), ["Seattle Bros"]);
  assert.deepEqual(historyTeamsInQuestion("Seattle Bros FC record?", history), ["Seattle Bros FC"]);
  const result = answerRatsHistoryQuestion("Seattle Bros record?", history);
  assert.match(result.reply, /1-1-1 \(W-D-L\)/);
  assert.equal(historyRecord(history,"Seattle Bros FC").games,3);
});

test("techies try hard shorthand and full name work for H2H", () => {
  const history = historyFixture();
  for (const season of history.seasons) {
    for (const team of season.teams) {
      if (team.name === "Team Alpha") team.name = "Techies Try Hard FC";
      if (team.name === "Team Beta") team.name = "Seattle Bros FC";
    }
    for (const match of season.matches) {
      if (match.homeTeam === "Team Alpha") match.homeTeam = "Techies Try Hard FC";
      if (match.awayTeam === "Team Alpha") match.awayTeam = "Techies Try Hard FC";
      if (match.homeTeam === "Team Beta") match.homeTeam = "Seattle Bros FC";
      if (match.awayTeam === "Team Beta") match.awayTeam = "Seattle Bros FC";
    }
  }
  assert.deepEqual(
    historyTeamsInQuestion("has techies try hard played seattle bros before?",history),
    ["Techies Try Hard FC","Seattle Bros FC"]
  );
  const answer = answerRatsHistoryQuestion("has techies try hard played seattle bros before?",history);
  assert.match(answer.reply,/2 meetings/);
  assert.equal(historyHeadToHead(history,"Techies Try Hard","Seattle Bros").matches.length,2);
});
