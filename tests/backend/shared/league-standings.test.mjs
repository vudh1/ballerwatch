import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLeagueStandings,
  buildLeagueTeamHistory,
  buildTeamScout,
  buildTeamRecentForm,
  buildMatchupEstimate,
  divisionStrengthMultiplier,
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
            homeScore: null, awayScore: null },
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

test("rank teams by points, fewer games played, then goal difference", () => {
  const data = archive();
  const current = data.seasons.at(-1);
  current.matches = [
    { date: "2026-10-01", homeTeam: "Third Touch FC", awayTeam: "Other B",
      homeScore: 1, awayScore: 0 },
    { date: "2026-10-02", homeTeam: "Other A", awayTeam: "Other B",
      homeScore: 3, awayScore: 0 },
    { date: "2026-10-03", homeTeam: "Third Touch FC", awayTeam: "Other A",
      homeScore: 1, awayScore: 1 },
    { date: "2026-10-04", homeTeam: "Other B", awayTeam: "Third Touch FC",
      homeScore: 0, awayScore: 1 },
  ];
  const card = buildLeagueStandings(data, "fall-2026", ["Third Touch FC", "Other A"],
    "2026-10-13").cards;
  assert.equal(card.length, 2, "Teams in the same division have separate slides");
  assert.deepEqual(card[0].rows, card[1].rows.map((row) => ({
    ...row, highlighted: row.name === "Third Touch FC",
  })));
  assert.equal(card[0].rows.length, 3);
  // Equal points: a team with one game ranks ahead of one with two.
  current.matches = [
    { date: "2026-10-01", homeTeam: "Other A", awayTeam: "Other B", homeScore: 2, awayScore: 0 },
    { date: "2026-10-02", homeTeam: "Third Touch FC", awayTeam: "Other B",
      homeScore: 1, awayScore: 0 },
    { date: "2026-10-03", homeTeam: "Third Touch FC", awayTeam: "Other B",
      homeScore: 0, awayScore: 1 },
  ];
  const rows = buildLeagueStandings(data, "fall-2026", ["Other A"], "2026-10-13").cards[0].rows;
  assert.ok(rows.findIndex((row) => row.name === "Other A") <
    rows.findIndex((row) => row.name === "Third Touch FC"));
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
  // Third Touch: 5 GF in three indexed matches across Fall 2025 and Fall 2026.
  const view = buildLeagueStandings(data, "fall-2026", ["Third Touch FC"], "2026-10-13");
  const stats = buildTeamScout(data, "fall-2026", "Third Touch FC", "2026-10-13");
  assert.deepEqual(stats.attack, { rank: 1, total: 3, perGame: 1.67, goals: 5, games: 3 });
  assert.deepEqual(stats.defense, { rank: 1, total: 3, perGame: 0.33, goals: 1, games: 3 });
  assert.equal(stats.previousSeason, null);
  assert.equal(stats.previousSeasonLabel, "Summer 2026");
  assert.equal(stats.archiveComplete, false);
});

test("previous season rank is unavailable when the immediate prior season is missing", () => {
  const data = archive();
  const view = buildLeagueStandings(data, "fall-2026", ["PhoSaiGon"], "2026-10-13");
  assert.equal(buildTeamScout(data, "fall-2026", "PhoSaiGon", "2026-10-13").previousSeason, null);
  // Never label Fall 2025 as the 'last season' of Fall 2026.
  assert.equal(buildTeamScout(data, "fall-2026", "PhoSaiGon", "2026-10-13").previousSeasonLabel, "Summer 2026");
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
  const stats = buildTeamScout(
    data, "fall-2026", "Third Touch FC", "2026-10-13",
  );
  assert.deepEqual(stats.previousSeason, {
    rank: 2, total: 2, label: "Summer 2026",
    division: "Thursday Coed D-4", matches: 1,
  });
});

test("current-season scores may be absent but past-season attack/defense stats remain available", () => {
  const data = archive();
  for (const match of data.seasons[1].matches) {
    match.homeScore = null;
    match.awayScore = null;
  }
  const stats = buildTeamScout(data, "fall-2026", "Third Touch FC", "2026-10-13");
  assert.equal(stats.attack?.games, 1);
  assert.equal(stats.defense?.games, 1);
  assert.equal(stats.quality?.games, 1);
});

test("opponent strength rewards quality victories without using head-to-head as opponent form", () => {
  const names = ["StrongVictors","WeakVictors","Tough","Soft","PunchingBag"];
  const data = {
    updatedAt:"2026-10-13T10:00:00Z",
    coverage:{complete:true},
    seasons:[{
      seasonId:"fall-2026",label:"Fall 2026",
      teams:names.map(name=>({name,day:"Tuesday",gender:"Men",division:"2",
        leagueName:"RATS 11v11 Fall 2026"})),
      matches:[
        {date:"2026-10-01",homeTeam:"StrongVictors",awayTeam:"Tough",homeScore:2,awayScore:0},
        {date:"2026-10-01",homeTeam:"WeakVictors",awayTeam:"Soft",homeScore:2,awayScore:0},
        {date:"2026-10-08",homeTeam:"Tough",awayTeam:"PunchingBag",homeScore:2,awayScore:0},
        {date:"2026-10-08",homeTeam:"Soft",awayTeam:"PunchingBag",homeScore:0,awayScore:2},
      ],
    }],
  };
  const strong = buildTeamScout(data,"fall-2026","StrongVictors","2026-10-13");
  const weak = buildTeamScout(data,"fall-2026","WeakVictors","2026-10-13");
  assert.equal(strong.current.wins,weak.current.wins);
  assert.equal(strong.current.played,weak.current.played);
  assert.ok(strong.quality.index > weak.quality.index);
  assert.ok(strong.quality.rank < weak.quality.rank);
  assert.equal(strong.quality.games,1);
  assert.equal(strong.currentFormat,"11v11");
  assert.ok(strong.quality.method.includes("excluded"));
});

test("8v8, 11v11 and unknown formats retain distinct historical records", () => {
  const data = {
    updatedAt:"2026-10-13T10:00:00Z",coverage:{complete:false},
    seasons:[
      {seasonId:"fall-2025",label:"Fall 2025",
       teams:[{name:"Club",day:"Wed",gender:"Coed",division:"2"},
         {name:"Opponent0",day:"Wed",gender:"Coed",division:"2"}],
       matches:[{date:"2025-10-01",homeTeam:"Club",awayTeam:"Opponent0",homeScore:1,awayScore:1}]},
      {seasonId:"summer-2026",label:"Summer 2026",
       teams:[{name:"Club",day:"Wed",gender:"Coed",division:"2",
           leagueName:"Summer 8v8 Coed"},
         {name:"Opponent1",day:"Wed",gender:"Coed",division:"2",leagueName:"Summer 8v8 Coed"}],
       matches:[{date:"2026-07-01",homeTeam:"Club",awayTeam:"Opponent1",homeScore:4,awayScore:2}]},
      {seasonId:"fall-2026",label:"Fall 2026",
       teams:[{name:"Club",day:"Wed",gender:"Coed",division:"2",
           leagueName:"Fall 11v11 Coed"},
         {name:"Opponent2",day:"Wed",gender:"Coed",division:"2",leagueName:"Fall 11v11 Coed"}],
       matches:[{date:"2026-10-01",homeTeam:"Club",awayTeam:"Opponent2",homeScore:0,awayScore:2}]},
    ],
  };
  const report = buildLeagueTeamHistory(data,"fall-2026","Club",35,"2026-10-13");
  assert.equal(report.scout.overall.games,3);
  assert.deepEqual([report.scout.formats["8v8"].wins,
    report.scout.formats["11v11"].losses, report.scout.formats.unknown.draws],[1,1,1]);
  assert.deepEqual(report.matches.map(m=>m.format),["11v11","8v8","unknown"]);
  assert.deepEqual(report.scout.recent.map(m=>m.result),["L","W","D"]);
  assert.equal(report.scout.overall.goalDifferencePerGame,0);
});

test("standings cards never bundle scout stats, which are fetched on team tap", () => {
  const cards = buildLeagueStandings(archive(),"fall-2026",["Third Touch FC"]).cards;
  assert.equal(Object.hasOwn(cards[0],"stats"),false);
  const history = buildLeagueTeamHistory(archive(),"fall-2026","Third Touch FC",35,"2026-10-13");
  assert.ok(history.scout.quality);
  assert.equal(history.scout.formats.unknown.games,3);
});

test("8v8 and 11v11 leagues never share a table or scouting-opponent sample", () => {
  const data={updatedAt:"2026-10-13T00:00:00Z",coverage:{complete:true},
    seasons:[{seasonId:"fall-2026",label:"Fall 2026",
      teams:[
        {name:"Eight A",day:"Tuesday",gender:"Men",division:"2",leagueName:"8v8"},
        {name:"Eight B",day:"Tuesday",gender:"Men",division:"2",leagueName:"8v8"},
        {name:"Eleven A",day:"Tuesday",gender:"Men",division:"2",leagueName:"11v11"},
        {name:"Eleven B",day:"Tuesday",gender:"Men",division:"2",leagueName:"11v11"},
      ],
      matches:[
        {date:"2026-10-01",homeTeam:"Eight A",awayTeam:"Eight B",
          homeScore:2,awayScore:1},
        {date:"2026-10-01",homeTeam:"Eleven A",awayTeam:"Eleven B",
          homeScore:1,awayScore:0},
      ]}]};
  const cards=buildLeagueStandings(data,"fall-2026",["Eight A","Eleven A"],"2026-10-13").cards;
  assert.deepEqual(cards.map(card=>card.rows.map(row=>row.name)),
    [["Eight A","Eight B"],["Eleven A","Eleven B"]]);
  assert.equal(buildTeamScout(data,"fall-2026","Eight A","2026-10-13").quality.total,2);
});

test("last-ten form combines earlier 11v11 with a new 8v8 season and weights 11v11 wins", () => {
  const teams=(leagueName)=>["Club","Opponent"].map(name=>({
    name,day:"Saturday",gender:"Coed",division:"1",leagueName
  }));
  const older=Array.from({length:9},(_,i)=>({
    date:`2025-06-${String(i+1).padStart(2,"0")}`,
    homeTeam:"Club",awayTeam:"Opponent",homeScore:2,awayScore:1,
  }));
  const data={updatedAt:"2026-10-13",coverage:{complete:true},seasons:[
    {seasonId:"summer-2025",label:"Summer 2025",
      teams:teams("Summer 11v11"),matches:older},
    {seasonId:"fall-2026",label:"Fall 2026",
      teams:teams("Fall 8v8"),matches:[
        {date:"2026-10-09",homeTeam:"Club",awayTeam:"Opponent",homeScore:0,awayScore:1},
      ]},
  ]};
  const scout=buildTeamScout(data,"fall-2026","Club","2026-10-13");
  assert.equal(scout.currentFormat,"8v8");
  assert.equal(scout.current.losses,1);
  assert.equal(scout.quality.games,10);
  assert.equal(scout.quality.wins,9);
  assert.ok(scout.quality.index > 0);
  assert.equal(scout.recentTen.games,10);
  assert.equal(scout.formats["11v11"].wins,9);
  assert.equal(scout.formats["8v8"].losses,1);
  assert.ok(scout.attack.games === 10 && scout.defense.games === 10);
  const form=buildTeamRecentForm(data,"Club","2026-10-13");
  assert.equal(form.games,10);
  // Nine older 11v11 wins outweigh a recent 8v8 loss, but recency matters.
  assert.equal(form.weightedWinPct,89);
});

test("last-ten window ignores older results while preserving all-time history", () => {
  const data={updatedAt:"2026-10-13",coverage:{complete:true},seasons:[{
    seasonId:"fall-2026",label:"Fall 2026",
    teams:["Club","Opponent"].map(name=>({name,day:"Tue",gender:"Men",division:"2",
      leagueName:"11v11"})),
    matches:Array.from({length:15},(_,i)=>({
      date:`2026-09-${String(i+1).padStart(2,"0")}`,
      homeTeam:"Club",awayTeam:"Opponent",
      homeScore:i < 5 ? 0 : 2,awayScore:1,
    })),
  }]};
  const scout=buildTeamScout(data,"fall-2026","Club","2026-10-13");
  assert.equal(scout.overall.games,15);
  assert.equal(scout.quality.games,10);
  assert.equal(scout.quality.wins,10);
  assert.equal(buildTeamRecentForm(data,"Club","2026-10-13").weightedWinPct,100);
  assert.equal(scout.attack.games,10);
});

test("no indexed results are displayed as unavailable, not zero-percent losses", () => {
  const data=archive();
  assert.equal(buildTeamRecentForm(data,"Nonexistent","2026-10-13"),null);
  const match=buildTeamScout(data,"fall-2026","Third Touch FC","2025-01-01");
  assert.equal(match.quality,null);
  assert.equal(match.recentTen,null);
});

test("tracked standings cards carry only their own optional recent form", () => {
  const view = buildLeagueStandings(
    archive(), "fall-2026", ["Third Touch FC"], "2026-10-13",
  );
  assert.equal(view.cards.length, 1);
  assert.equal(view.cards[0].recentForm.team, "Third Touch FC");
  assert.equal(view.cards[0].recentForm.games, 3);
  assert.ok(Number.isFinite(view.cards[0].recentForm.weightedWinPct));
  assert.equal(Object.hasOwn(view.cards[0], "opponentForm"), false);
  assert.equal(view.cards[0].rows.some((row) => Object.hasOwn(row, "recentForm")), false);
});

test("duplicate Sitting Ducks names resolve only within the selected division", () => {
  const data = archive();
  data.seasons[1].teams.push({
    name: "Sitting Ducks", day: "Wednesday", gender: "Coed",
    division: "1", leagueName: "Coed 8v8",
  }, {
    name: "Sitting Ducks", day: "Tuesday", gender: "Men",
    division: "2", leagueName: "Men 11v11",
  });
  data.seasons[1].matches.push({
    date: "2026-10-12", homeTeam: "Sitting Ducks", awayTeam: "Third Touch FC",
    homeScore: 1, awayScore: 0,
  });
  assert.equal(buildLeagueTeamHistory(
    data, "fall-2026", "Sitting Ducks", 35, "2026-10-13",
  ), null);
  const cards = buildLeagueStandings(
    data, "fall-2026", ["Third Touch FC", "PhoSaiGon"], "2026-10-13",
  ).cards;
  const men = cards[0].divisionKey;
  const report = buildLeagueTeamHistory(
    data, "fall-2026", "Sitting Ducks", 35, "2026-10-13", men,
  );
  assert.equal(report.team, "Sitting Ducks");
  assert.equal(report.scout.division, "Tuesday Men D-2");
  assert.equal(report.scout.quality.games, 1);
  assert.equal(buildLeagueTeamHistory(
    data, "fall-2026", "Sitting Ducks", 35, "2026-10-13", "invalid|division",
  ), null);
});

test("conservative matchup estimate shrinks 2/2 raw wins and includes head-to-head", () => {
  const data = {updatedAt:"2026-10-13T12:00:00Z",seasons:[{
    seasonId:"fall-2026",label:"Fall 2026",
    teams:["Monitored","Opponent","Third"].map(name=>({
      name,day:"Tuesday",gender:"Men",division:"1",leagueName:"11v11",
    })),
    matches:[
      {date:"2026-10-01",homeTeam:"Monitored",awayTeam:"Third",homeScore:2,awayScore:0},
      {date:"2026-10-03",homeTeam:"Monitored",awayTeam:"Opponent",homeScore:3,awayScore:1},
      {date:"2026-10-05",homeTeam:"Opponent",awayTeam:"Third",homeScore:2,awayScore:0},
    ],
  }]};
  const estimate=buildMatchupEstimate(data,"Monitored","Opponent","2026-10-13");
  assert.ok(estimate.winPct > 0 && estimate.winPct < 85);
  assert.ok(estimate.winPct > estimate.lossPct);
  assert.equal(estimate.winPct + estimate.drawPct + estimate.lossPct, 100);
  assert.equal(estimate.teamGames,2);
  assert.equal(estimate.headToHeadGames,1);
  assert.equal(estimate.sampleLimited,true);
  const noH2H = structuredClone(data);
  noH2H.seasons[0].matches.splice(1,1);
  assert.equal(buildMatchupEstimate(noH2H,"Monitored","Opponent","2026-10-13")
    .headToHeadGames,0);
  assert.equal(buildMatchupEstimate(data,"Ghost","Unknown","2026-10-13"),null);
});

test("standings attaches next fixture matchup estimates separately from live calendar", () => {
  const data=archive();
  const view=buildLeagueStandings(
    data,"fall-2026",["Third Touch FC"],"2026-10-13",
    [{team:"Third Touch FC",opponent:"Other A"}],
  );
  const estimate=Object.values(view.matchups)[0];
  assert.ok(estimate);
  assert.equal(estimate.team,"Third Touch FC");
  assert.equal(estimate.opponent,"Other A");
  assert.ok(estimate.winPct >= 10 && estimate.winPct <= 80);
  assert.equal(estimate.winPct + estimate.drawPct + estimate.lossPct, 100);
  assert.equal(Object.keys(view.matchups).length,1);
});

test("published division strength respects D1 > D2a > D2b > D2c > D3 and neutral unknown", () => {
  const levels = [
    { divisionLabel: "D1" }, { division: "D2a" },
    { leagueName: "Tuesday Men Division 2b" }, { divisionLabel: "D-2c" },
    { division: "D3" },
  ].map(divisionStrengthMultiplier);
  assert.deepEqual(levels, [1.30, 1.18, 1.10, 1.03, 0.90]);
  assert.equal(divisionStrengthMultiplier({ division: "2" }), 1.10);
  assert.equal(divisionStrengthMultiplier({ division: "2", leagueName: "Men D2a" }), 1.18);
  assert.equal(divisionStrengthMultiplier({ divisionLabel: "No bracket" }), 1);
  assert.equal(divisionStrengthMultiplier({ division: "4" }), 1);
});

test("equal winning records against D1 outrank D3 and W/D/L sum to 100", () => {
  const team = (name, division) => ({
    name, division, day: "Tuesday", gender: "Men", leagueName: "11v11",
  });
  const pairs = [["High", "H Rival", "D1"],
    ["Low", "L Rival", "D3"], ["Reference", "R Rival", "D2b"]];
  const teams = pairs.flatMap(([name, rival, division]) =>
    [team(name, division), team(rival, division)]);
  const matches = pairs.flatMap(([name, rival]) =>
    Array.from({ length: 10 }, (_, day) => ({
      date: `2026-10-${String(day + 1).padStart(2, "0")}`,
      homeTeam: name, awayTeam: rival, homeScore: 2, awayScore: 0,
    })));
  const archive = { seasons: [{
    seasonId: "fall-2026", teams, matches,
  }] };
  const high = buildMatchupEstimate(archive, "High", "Reference", "2026-10-13");
  const low = buildMatchupEstimate(archive, "Low", "Reference", "2026-10-13");
  assert.ok(high.winPct > low.winPct);
  for (const prediction of [high, low]) {
    assert.equal(prediction.winPct + prediction.drawPct + prediction.lossPct, 100);
    assert.equal(prediction.sampleLimited, false);
    assert.match(prediction.method, /Uncalibrated/);
  }
});
