/**
 * Hourly, notification-silent public scouting projections (v8.6.0; v8.7.0 model).
 *
 * GitHub Actions computes the expensive archive-wide model independently of
 * every browser and Worker request. Only a complete AES-GCM encrypted envelope
 * is written to the runtime-state branch; the Worker reads the small derived
 * projection without loading or ranking historical fixtures at request time.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { briefingFacts, applyBriefing, rankBriefingFacts } from "../shared/scout-briefing.mjs";
import { SCOUT_MODEL_FILE, usableModel } from "./scouting-model.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { buildLeagueStandings, buildLeagueTeamHistory, buildMatchupEstimate } from "../shared/league-standings.mjs";
import { PRODUCTION_SCOUT_WEIGHTS } from "../shared/scout-calibration.mjs";

export const SCOUT_INDEX_FILE = "league/state/scout-index.json";

function readState(file) {
  try {
    return decryptState(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function scoutReportId(divisionKey, teamName) {
  return JSON.stringify([String(divisionKey || ""), String(teamName || "")]);
}

export function buildScoutingIndex({
  history, league, teams, today, modelState = null, generatedAt = new Date().toISOString(),
}) {
  const seasonId = String(league?.seasonId || league?.season || "").trim();
  const monitored = Array.isArray(teams) ? teams.filter((team) =>
    typeof team === "string" && team.trim()) : [];
  const fixtures = (Array.isArray(league?.teams) ? league.teams : [])
    .flatMap((team) => Array.isArray(team?.matches) ? team.matches : [])
    .filter((game) => game?.date >= today && game?.team && game?.opponent)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 25);
  // Release-reviewed weights are pinned: no archive-wide candidate search on the
  // hourly job. The independent weekly audit can propose a NEW release, never
  // silently switch production. This snapshot remains read-only for web requests.
  const calibration = {
    modelVersion: 2,
    status: "production-locked",
    weights: { ...PRODUCTION_SCOUT_WEIGHTS },
    holdoutSeason: "summer-2026",
    holdoutGames: 1474,
    holdoutLogLoss: 0.95638,
    baselineHoldoutLogLoss: 0.96162,
    holdoutBrier: 0.57217,
    baselineHoldoutBrier: 0.57399,
    note: "v8.11.1 manually approved candidate on untouched Summer 2026 holdout; release-pinned until reviewed again. Estimates remain provisional, not bookmaker odds.",
  };
  if (usableModel(modelState, seasonId, new Date(generatedAt))) {
    Object.assign(calibration, modelState, { modelVersion: 3,
      note: "Weekly development-selected goal-rate ensemble passed independent holdout and paired date-group gates. Falls back to release-reviewed weights on expiry or season change. Provisional, not bookmaker odds." });
  }
  const standings = buildLeagueStandings(
    history, seasonId, monitored, today, fixtures, calibration.weights,
  );
  // A public, name-only team directory is prepared in the same hourly job.
  // Settings can search it without scanning historical archives on an HTTP GET.
  const currentSeason = history.seasons.find((item) => item.seasonId === seasonId);
  const teamDirectory = new Map();
  for (const entry of currentSeason?.teams || []) {
    const name = String(entry?.name || "").trim().replace(/\s+/g, " ");
    if (!name || name.length > 120) continue;
    const key = name.toLocaleLowerCase("en");
    if (!teamDirectory.has(key)) teamDirectory.set(key, name);
  }
  for (const name of monitored) {
    const key = name.toLocaleLowerCase("en");
    if (!teamDirectory.has(key)) teamDirectory.set(key, name);
  }
  const teamOptions = [...teamDirectory.values()]
    .sort((left, right) => left.localeCompare(right)).slice(0, 450);
  // Precompute the full public current-season fixture catalogue and its
  // forecasts once per hourly job. Anonymous team changes read only this
  // snapshot; no browser/API request parses an archive or runs scouting.
  const availableMatches = (currentSeason?.matches || [])
    .filter((match) => match?.date >= today && match?.homeTeam && match?.awayTeam)
    .sort((left, right) => left.date.localeCompare(right.date) ||
      String(left.startTime || "").localeCompare(String(right.startTime || "")))
    .slice(0, 1200)
    .map((match) => ({
      id: String(match.id || ""), date: match.date,
      startTime: String(match.startTime || ""), endTime: String(match.endTime || ""),
      location: String(match.location || ""),
      homeTeam: match.homeTeam, awayTeam: match.awayTeam,
      homeColor: String(match.homeColor || ""),
      awayColor: String(match.awayColor || ""),
    }));
  const normalize = (name) => String(name || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\b(?:fc|sc)\b$/g, "").trim();
  const availableMatchups = {};
  for (const match of availableMatches) {
    const home = normalize(match.homeTeam), away = normalize(match.awayTeam);
    const key = [home, away].join("|"), reverse = [away, home].join("|");
    if (!home || !away || home === away || availableMatchups[key]) continue;
    const estimate = buildMatchupEstimate(
      history, match.homeTeam, match.awayTeam, today, calibration.weights);
    if (!estimate) continue;
    availableMatchups[key] = estimate;
    // Reversing a single fixture doesn't create an additional sporting event.
    availableMatchups[reverse] = {
      ...estimate, team: match.awayTeam, opponent: match.homeTeam,
      winPct: estimate.lossPct, lossPct: estimate.winPct,
      teamGames: estimate.opponentGames, opponentGames: estimate.teamGames,
    };
  }
  standings.matchups = { ...availableMatchups, ...standings.matchups };
  // A distinct card per monitored team, even if two share the same division.
  const availableCards = buildLeagueStandings(
    history, seasonId, teamOptions, today, [], calibration.weights,
  ).cards;
  const reports = {};
  for (const card of standings.cards) {
    if (!card.ready) continue;
    for (const row of card.rows) {
      const id = scoutReportId(card.divisionKey || card.division, row.name);
      if (Object.hasOwn(reports, id)) continue;
      const report = buildLeagueTeamHistory(
        history, seasonId, row.name, 35, today, card.divisionKey || card.division,
        calibration.weights,
      );
      if (report) {
        report.scout.briefing = applyBriefing(report.scout);
        reports[id] = report;
      }
    }
  }
  return {
    schemaVersion: 2,
    seasonId,
    teamOptions,
    updatedAt: String(history?.updatedAt || ""),
    generatedAt,
    today,
    monitoredTeams: monitored,
    standings,
    availableCards,
    availableMatches,
    model: calibration,
    reports,
  };
}

export async function refreshScoutingIndex({
  now = new Date(), file = SCOUT_INDEX_FILE, env = process.env,
} = {}) {
  const history = readState("league/state/history.json");
  const league = readState("league/state/schedule.json");
  const teamConfig = readState("league/state/teams.json");
  if (!Array.isArray(history?.seasons) || !league?.seasonId ||
      !Array.isArray(teamConfig?.teams)) {
    // Keep the last valid encrypted projection if one upstream source failed.
    console.warn("::warning::Scouting source incomplete; retained last indexed report.");
    return false;
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric",
    month: "2-digit", day: "2-digit",
  }).format(now);
  const value = buildScoutingIndex({
    history, league, teams: teamConfig.teams, today,
    generatedAt: now.toISOString(), modelState: readState(SCOUT_MODEL_FILE),
  });
  // Fail closed and keep the last successful snapshot; never publish empty
  // projections caused by a transient upstream failure.
  if (!value.standings.cards.some((card) => card.ready)) {
    console.warn("::warning::No current league scouting cards; retained last report.");
    return false;
  }
  const previous = readState(file);
  const digest = createHash("sha256").update(JSON.stringify(Object.entries(value.reports).map(([id, report]) =>
    [id, briefingFacts(report.scout)]))).digest("hex");
  let ranking = previous?.briefingPreparation?.digest === digest ? previous.briefingPreparation.ranking || {} : {};
  const nextAttempt = Date.parse(previous?.briefingPreparation?.nextAttemptAt || "");
  if (!Number.isFinite(nextAttempt) || nextAttempt <= now.getTime()) {
    ranking = await rankBriefingFacts(value.reports, env);
    value.briefingPreparation = { digest, ranking,
      nextAttemptAt: new Date(now.getTime() + 24 * 3600000).toISOString() };
  } else value.briefingPreparation = { digest, ranking, nextAttemptAt: previous.briefingPreparation.nextAttemptAt };
  for (const [id, report] of Object.entries(value.reports)) {
    report.scout.briefing = applyBriefing(report.scout, ranking[id]);
    report.scout.briefingReviewed = Boolean(ranking[id]?.length);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(encryptState(value), null, 2) + "\n");
  console.log(
    "Prepared encrypted scouting index:", Object.keys(value.reports).length,
    "teams; model:", value.model.status,
    "; holdout:", value.model.holdoutSeason,
    "; holdout games:", value.model.holdoutGames,
    "; held-out Brier:", value.model.holdoutBrier,
    "; baseline:", value.model.baselineHoldoutBrier,
  );
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await refreshScoutingIndex();
}
