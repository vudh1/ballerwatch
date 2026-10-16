/**
 * Offline, aggregate-only chronological evaluation for public RATS results.
 * v8.11.0: decrypt the canonical archive in Actions memory; never log games,
 * teams, secrets or predictions. The separate weekly model job applies gates.
 */
import fs from "node:fs";
import { validGoalConfig } from "../shared/scout-goals.mjs";
import { pathToFileURL } from "node:url";
import { decryptState } from "../shared/state-crypto.mjs";
import { historyTeamKey } from "../shared/rats-history.mjs";
import {
  DEFAULT_SCOUT_WEIGHTS, PRODUCTION_SCOUT_WEIGHTS, scoutingFormat as format, scoutingTier as tier, forecastFromFeatures, roundThreeWay, tuneScoutingWeights,
} from "../shared/scout-calibration.mjs";

const seasonOrder = (value) => {
  const match = /^(winter|spring|summer|fall)-(\d{4})$/i.exec(String(value || ""));
  return match ? +match[2] * 4 + ["winter","spring","summer","fall"].indexOf(match[1].toLowerCase()) : -1;
};
const bounded = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v) => Number.isFinite(v) ? +v.toFixed(5) : null;
const outcomeIndex = (a,b) => a > b ? 0 : a===b ? 1 : 2;
const goalsEvent = (game,home) => ({
  date:game.date,scored:home?game.a:game.b,conceded:home?game.b:game.a,
  tier:home?game.homeTier:game.awayTier,format:home?game.homeFormat:game.awayFormat,
  opponent:home?game.away:game.home,
});
function gameRows(history, currentSeason) {
  const seen = new Set();
  const coverage = [];
  const games = [];
  const seasons = (history.seasons || []).filter(s=>seasonOrder(s.seasonId)>=0)
    .sort((a,b)=>seasonOrder(a.seasonId)-seasonOrder(b.seasonId));
  for (const season of seasons) {
    const names = new Map();
    const invalid = new Set();
    for (const team of season.teams || []) {
      const key=historyTeamKey(team.name);
      if (names.has(key)) invalid.add(key);
      names.set(key,team);
    }
    let scored=0, rejected=0, incomplete=0;
    for (const m of season.matches || []) {
      const home=historyTeamKey(m.homeTeam),away=historyTeamKey(m.awayTeam);
      const a=Number(m.homeScore),b=Number(m.awayScore);
      if (m.homeScore == null || m.awayScore == null || !Number.isInteger(a) || !Number.isInteger(b) || a<0 || b<0 || a>40 || b>40) {incomplete++;continue;}
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !home || !away ||
          home===away || invalid.has(home) || invalid.has(away)) {rejected++;continue;}
      const id=[season.seasonId,m.date,home,away,m.startTime || "",a,b].join("|");
      if (seen.has(id)) {rejected++;continue;}
      seen.add(id);
      const ht=names.get(home),at=names.get(away);
      games.push({date:m.date,season:season.seasonId,home,away,a,b,
        division:String(ht?.division || at?.division || "unknown").replace(/[^a-z0-9]/gi,"").slice(0,8) || "unknown",
        homeTier:tier(ht),awayTier:tier(at),homeFormat:format(ht),awayFormat:format(at)});
      scored++;
    }
    coverage.push({season:season.seasonId,teams:names.size,
      divisions:new Set((season.teams||[]).map(x=>String(x.division||"unknown"))).size,
      games:(season.matches||[]).length,scored,rejected,incomplete,
      coveragePct:(season.matches||[]).length?round(scored/(season.matches||[]).length*100):null,
      source:"canonical encrypted RATS aggregate index"});
  }
  games.sort((a,b)=>a.date.localeCompare(b.date) || seasonOrder(a.season)-seasonOrder(b.season) ||
    a.home.localeCompare(b.home) || a.away.localeCompare(b.away) || a.a-b.a || a.b-b.b);
  return {games,seasons,coverage};
}
function scoreCandidate(ours,theirs,meetings,weights) {
  return forecastFromFeatures(ours.slice(0,10),theirs.slice(0,10),meetings.slice(0,5),weights);
}
function eloProbability(ratingA,ratingB) {
  const share=1/(1+Math.pow(10,(ratingB-ratingA)/400));
  const draw=.21;
  return {win:(1-draw)*share,draw,loss:(1-draw)*(1-share)};
}
function gdProbability(ours,theirs) {
  const rate=(list)=>list.slice(0,10).reduce((s,v)=>s+(v.scored-v.conceded),0)/Math.max(4,Math.min(10,list.length));
  const share=1/(1+Math.exp(-.36*(rate(ours)-rate(theirs))));
  return {win:.8*share,draw:.2,loss:.8*(1-share)};
}
function diagnostics(records) {
  const n=records.length;
  if(!n)return null;
  const sum=(fn)=>records.reduce((v,x)=>v+fn(x),0)/n;
  const eps=1e-9;
  const per=(x)=>[x.p.win,x.p.draw,x.p.loss];
  const err=(x)=>per(x).map((p,i)=>p-Number(x.outcome===i));
  const ll=sum(x=>-Math.log(Math.max(eps,per(x)[x.outcome])));
  const brier=sum(x=>err(x).reduce((s,e)=>s+e*e,0));
  const rps=sum(x=>{const e=err(x);return (e[0]*e[0]+(e[0]+e[1])**2)/2;});
  const favorites=records.filter(x=>x.outcome!==1);
  const favoriteCorrect=favorites.filter(x=>per(x).indexOf(Math.max(...per(x)))===x.outcome).length;
  const rounded=sum(x=>{
    const p=roundThreeWay(x.p);
    const r=[p.winPct,p.drawPct,p.lossPct].map(v=>v/100);
    return -Math.log(Math.max(eps,r[x.outcome]));
  });
  const bins=Array.from({length:10},(_,i)=>{
    const subset=records.filter(x=>Math.min(9,Math.floor(x.p.win*10))===i);
    const count=subset.length;
    if(!count)return {range:`${i*10}-${i*10+10}`,count:0,sparse:true};
    const win=subset.filter(x=>x.outcome===0).length/count;
    const z=1.96,p=win;
    const denominator=1+z*z/count;
    const center=(p+z*z/(2*count))/denominator;
    const half=z*Math.sqrt(p*(1-p)/count+z*z/(4*count*count))/denominator;
    return {range:`${i*10}-${i*10+10}`,count,
      avgPredictedPct:round(subset.reduce((s,x)=>s+x.p.win,0)/count*100),
      actualWinPct:round(100*win),
      wilson95Pct:[round(100*Math.max(0,center-half)),round(100*Math.min(1,center+half))],
      sparse:count<30};
  });
  return {n,logLoss:round(ll),brier:round(brier),rps:round(rps),
    mostLikelyAccuracy:round(sum(x=>Number(per(x).indexOf(Math.max(...per(x)))===x.outcome))),
    favoriteAccuracyExcludingDraws:favorites.length?round(favoriteCorrect/favorites.length):null,
    actualDrawPct:round(100*records.filter(x=>x.outcome===1).length/n),
    roundedTo5LogLoss:round(rounded),reliability:bins};
}
function groupStats(records,by) {
  return Object.fromEntries([...new Set(records.map(by))].sort().map(label=>[label,diagnostics(records.filter(x=>by(x)===label))]));
}
/** Public aggregate models are replayed in date batches: games on the same day never train on each other. */
export function evaluateArchive(history,currentSeasonId, proposals = []) {
  const {games,seasons,coverage}=gameRows(history,currentSeasonId);
  const completed=seasons.filter(s=>s.seasonId!==currentSeasonId && seasonOrder(s.seasonId)<seasonOrder(currentSeasonId));
  const holdout=completed.at(-1)?.seasonId;
  const train=completed.filter(s=>s.seasonId!==holdout);
  // The untouched last full season never enters parameter selection.
  const model=tuneScoutingWeights({seasons:train},currentSeasonId);
  const candidate=model.weights || DEFAULT_SCOUT_WEIGHTS;
  const configs = [];
  for (const blend of [0.2, 0.4, 0.6]) for (const prior of [3, 6, 10]) {
    configs.push({ blend, prior, decay: 0.94 });
  }
  for (const proposal of proposals.slice(0, 6)) {
    const config = validGoalConfig(proposal);
    if (config && !configs.some((item) => JSON.stringify(item) === JSON.stringify(config))) configs.push(config);
  }
  const challengers = Object.fromEntries(configs.map((goals, index) =>
    [`goals-${index}`, { ...PRODUCTION_SCOUT_WEIGHTS, goals }]));
  const models=["champion-v0","champion-production","candidate","league-average","goal-difference","elo", ...Object.keys(challengers)];
  const records=Object.fromEntries(models.map(m=>[m,[]]));
  const histories=new Map(),elo=new Map(),seasonCount=new Map();
  const rated=(t)=>elo.get(t)??1500;
  for(let index=0;index<games.length;){
    const date=games[index].date;
    let end=index+1;while(end<games.length && games[end].date===date)end++;
    const todays=games.slice(index,end);
    for(const game of todays) {
      const ours=histories.get(game.home)||[],theirs=histories.get(game.away)||[];
      const meetings=ours.filter(x=>x.opponent===game.away);
      const label=`${game.season}|${game.home}`;
      const order=(seasonCount.get(label)||0)+1;
      const outcome=outcomeIndex(game.a,game.b);
      const projections={
        "champion-v0":scoreCandidate(ours,theirs,meetings,DEFAULT_SCOUT_WEIGHTS),
        "champion-production":scoreCandidate(ours,theirs,meetings,PRODUCTION_SCOUT_WEIGHTS),
        ...Object.fromEntries(Object.entries(challengers).map(([name, weights]) =>
          [name, scoreCandidate(ours, theirs, meetings, weights)])),
        candidate:scoreCandidate(ours,theirs,meetings,candidate),
        "league-average":{win:.395,draw:.21,loss:.395},
        "goal-difference":gdProbability(ours,theirs),
        elo:eloProbability(rated(game.home),rated(game.away)),
      };
      for(const name of models) records[name].push({
        p:projections[name],outcome,date:game.date,season:game.season,
        division:game.division,phase:order<=3?"1-3":order<=6?"4-6":"7+",
        holdout:game.season===holdout});
    }
    // Ratings update only after the entire calendar date has been scored.
    for(const game of todays){
      for(const [team,isHome] of [[game.home,true],[game.away,false]]) {
        const items=histories.get(team)||[];
        items.unshift(goalsEvent(game,isHome));
        if(items.length>60)items.length=60;
        histories.set(team,items);
        const label=`${game.season}|${team}`;
        seasonCount.set(label,(seasonCount.get(label)||0)+1);
      }
      const actual=game.a>game.b?1:game.a===game.b?.5:0;
      const predicted=1/(1+Math.pow(10,(rated(game.away)-rated(game.home))/400));
      const offset=28*(actual-predicted);
      elo.set(game.home,rated(game.home)+offset);
      elo.set(game.away,rated(game.away)-offset);
    }
    index=end;
  }
  const select=(list,isHoldout)=>list.filter(x=>x.holdout===isHoldout);
  const reports=Object.fromEntries(models.map(name=>[name,{
    development:diagnostics(records[name].filter((entry) => !entry.holdout && seasonOrder(entry.season) < seasonOrder(holdout))),
    holdout:diagnostics(select(records[name],true)),
    bySeason:groupStats(records[name],x=>x.season),
    byDivision:groupStats(records[name],x=>x.division),
    bySeasonGameNumber:groupStats(records[name],x=>x.phase),
  }]));
  // Select on completed DEVELOPMENT seasons only. Current scores and the
  // newest complete holdout never participate in hyperparameter selection.
  const development = (name) => diagnostics(records[name].filter((entry) =>
    !entry.holdout && seasonOrder(entry.season) < seasonOrder(holdout)));
  const pool = ["champion-production", ...Object.keys(challengers)];
  const selected = pool.reduce((best, name) =>
    (development(name)?.logLoss ?? Infinity) < (development(best)?.logLoss ?? Infinity) ? name : best,
  "champion-production");
  const incumbent = reports["champion-production"].holdout;
  const tested = reports[selected].holdout;
  const losses = (entry) => -Math.log(Math.max(1e-9,
    [entry.p.win, entry.p.draw, entry.p.loss][entry.outcome]));
  // Pair by date rather than pretending fixtures on the same day are independent.
  const differences = new Map();
  records[selected].forEach((entry, index) => {
    if (!entry.holdout) return;
    const list = differences.get(entry.date) || [];
    list.push(losses(records["champion-production"][index]) - losses(entry));
    differences.set(entry.date, list);
  });
  const means = [...differences.values()].map((items) => items.reduce((a, b) => a + b, 0) / items.length);
  const mean = means.reduce((a, b) => a + b, 0) / Math.max(1, means.length);
  const se = means.length > 1 ? Math.sqrt(means.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
    (means.length * (means.length - 1))) : Infinity;
  const superior = selected !== "champion-production" && tested?.n >= 100 && means.length >= 12 &&
    incumbent.logLoss - tested.logLoss >= 0.005 && mean - 1.96 * se > 0 &&
    tested.brier <= incumbent.brier && ["league-average", "goal-difference", "elo"]
      .every((name) => tested.logLoss < reports[name].holdout?.logLoss);
  return {schemaVersion:1,createdAt:new Date().toISOString(),
    dataSources:["canonical encrypted RATS aggregate index (website-derived; no plaintext output)"],
    seasons:coverage,archiveSeasonCount:seasons.length,scoredGames:games.length,
    holdoutSeason:holdout||null,holdoutUnseenDuringTuning:true,
    candidateWeights:candidate,candidateStatus:model.status,
    challengerConfigs: challengers,
    selectedModel: selected,
    selectedWeights: challengers[selected] || { ...PRODUCTION_SCOUT_WEIGHTS },
    pairedDateGroups: means.length,
    pairedLogLossLift95Lower: round(mean - 1.96 * se),
    productionPromotionRecommended:superior,
    productionPromotionBlockedReason:superior ? null : "Retain champion: candidate must pass development selection, 100 holdout games, 12 date groups, positive paired lift and all baseline gates",
    comparisons:reports,
    warnings:["Unknown formats remain neutral; ambiguous same-season team aliases and unscored games excluded.",
      "Tier inferred only from published team labels; no guessing missing match results.",
      "All games sharing a date use ratings from prior dates only.",
      "The development replay uses fixed selected parameters and is diagnostic, not independent validation.",
      "Only a development-selected challenger passing all independent holdout gates is eligible for the next encrypted snapshot."],
  };
}
export function evaluateEncryptedHistory(path="league/state/history.json",currentSeason="") {
  const history=decryptState(JSON.parse(fs.readFileSync(path,"utf8")));
  if(!Array.isArray(history?.seasons))throw Error("Encrypted RATS archive is incomplete");
  return evaluateArchive(history,currentSeason || history.seasons.at(-1)?.seasonId || "");
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  // Aggregate-only JSON is safe for Actions summary. Never print raw team/game rows.
  const summary=evaluateEncryptedHistory("league/state/history.json",process.env.SCOUT_CURRENT_SEASON || "");
  console.log(JSON.stringify(summary,null,2));
  if(process.env.GITHUB_STEP_SUMMARY){
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### RATS model weekly evaluation\n\nHoldout: ${summary.holdoutSeason || "insufficient archive"}, scored games: ${summary.scoredGames}.\n\nCandidate promotion allowed: ${summary.productionPromotionRecommended ? "yes (needs human review)":"no"}.\n\nSee aggregate job output for Brier, RPS, log loss and reliability.\n`);
  }
}
