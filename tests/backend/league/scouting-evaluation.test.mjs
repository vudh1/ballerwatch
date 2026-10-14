import test from "node:test";
import assert from "node:assert/strict";
import { evaluateArchive } from "../../../backend/league/scouting-evaluation.mjs";

function sample() {
  const ids=["summer-2023","fall-2023","winter-2024","spring-2024",
    "summer-2024","fall-2024","winter-2025","spring-2025",
    "summer-2025","fall-2025","winter-2026","spring-2026",
    "summer-2026","fall-2026"];
  return {seasons:ids.map((seasonId,n)=>{
    const [season,yr]=seasonId.split("-");
    const mo=({winter:"01",spring:"04",summer:"07",fall:"10"})[season];
    const teams=["Alpha", "Bravo", "Charlie","Delta"].map(name=>({
      name,leagueName:"Sunday Men's 11v11",division:"2a",day:"Sunday",gender:"Men",
    }));
    const matches=[];
    for(let j=0;j<12;j++)matches.push({
      date:`${yr}-${mo}-${String(1+Math.floor(j/2)).padStart(2,"0")}`,
      homeTeam:teams[j%4].name,awayTeam:teams[(j+1+(Math.floor(j/4)%2))%4].name,
      homeScore:(n+j)%4,awayScore:(n+Math.floor(j/3))%3,
    });
    return {seasonId,teams,matches};
  })};
}
test("date-batched replay reports proper holdout and aggregate-only forecasts",()=>{
  const result=evaluateArchive(sample(),"fall-2026");
  assert.equal(result.holdoutSeason,"summer-2026");
  assert.equal(result.holdoutUnseenDuringTuning,true);
  assert.equal(result.archiveSeasonCount,14);
  assert.ok(result.scoredGames>100);
  for(const name of ["champion-v0","candidate","league-average","goal-difference","elo"]){
    const forecast=result.comparisons[name];
    assert.ok(forecast.holdout.n>0);
    assert.ok(Number.isFinite(forecast.holdout.logLoss));
    assert.ok(Number.isFinite(forecast.holdout.brier));
    assert.ok(Number.isFinite(forecast.holdout.rps));
    assert.equal(forecast.holdout.reliability.length,10);
  }
  // Neither named teams nor individual games leave in-memory evaluation.
  const summary=JSON.stringify(result);
  assert.doesNotMatch(summary,/Alpha|Bravo|Charlie|Delta|homeTeam|awayTeam/);
});
test("discard missing, ambiguous and unscored results without fabricating",()=>{
  const input=sample();
  input.seasons[0].matches.push({
    date:"2023-07-07",homeTeam:"Alpha",awayTeam:"Bravo",homeScore:null,awayScore:null,
  });
  input.seasons[0].teams.push({...input.seasons[0].teams[0],division:"3"});
  const output=evaluateArchive(input,"fall-2026");
  assert.ok(output.seasons[0].incomplete>=1);
  assert.ok(output.seasons[0].rejected>=1);
});
