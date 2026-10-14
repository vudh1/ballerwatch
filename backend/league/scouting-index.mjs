/**
 * Hourly, notification-silent public scouting projections (v8.6.0; v8.7.0 model).
 *
 * GitHub Actions computes the expensive archive-wide model independently of
 * every browser and Worker request. Only a complete AES-GCM encrypted envelope
 * is written to the runtime-state branch; the Worker reads the small derived
 * projection without loading or ranking historical fixtures at request time.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { buildLeagueStandings, buildLeagueTeamHistory } from "../shared/league-standings.mjs";

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
  history, league, teams, today, generatedAt = new Date().toISOString(),
}) {
  const seasonId = String(league?.seasonId || league?.season || "").trim();
  const monitored = Array.isArray(teams) ? teams.filter((team) =>
    typeof team === "string" && team.trim()) : [];
  const fixtures = (Array.isArray(league?.teams) ? league.teams : [])
    .flatMap((team) => Array.isArray(team?.matches) ? team.matches : [])
    .filter((game) => game?.date >= today && game?.team && game?.opponent)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 25);
  const standings = buildLeagueStandings(
    history, seasonId, monitored, today, fixtures,
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
  const reports = {};
  for (const card of standings.cards) {
    if (!card.ready) continue;
    for (const row of card.rows) {
      const id = scoutReportId(card.divisionKey || card.division, row.name);
      if (Object.hasOwn(reports, id)) continue;
      const report = buildLeagueTeamHistory(
        history, seasonId, row.name, 35, today, card.divisionKey || card.division,
      );
      if (report) reports[id] = report;
    }
  }
  return {
    schemaVersion: 3,
    seasonId,
    teamOptions,
    updatedAt: String(history?.updatedAt || ""),
    generatedAt,
    today,
    monitoredTeams: monitored,
    standings,
    reports,
  };
}

export function refreshScoutingIndex({
  now = new Date(), file = SCOUT_INDEX_FILE,
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
    generatedAt: now.toISOString(),
  });
  // Fail closed and keep the last successful snapshot; never publish empty
  // projections caused by a transient upstream failure.
  if (!value.standings.cards.some((card) => card.ready)) {
    console.warn("::warning::No current league scouting cards; retained last report.");
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(encryptState(value), null, 2) + "\n");
  console.log(`Prepared encrypted scouting index: ${Object.keys(value.reports).length} teams.`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshScoutingIndex();
}
