/**
 * Standalone hourly public RATS scouting projector (v8.6.0).
 *
 * GitHub Actions decrypts the encrypted public-results archive in private
 * process memory, computes a bounded immutable snapshot, and encrypts it before
 * persisting on runtime-state. The Worker only reads the finished projection.
 * No private RSVPs, passwords, or user account state enter this model.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { buildScoutingSnapshot } from "../shared/league-standings.mjs";

export const SCOUTING_FILE = "league/state/scouting.json";

function readEncryptedJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const value = decryptState(JSON.parse(fs.readFileSync(file, "utf8")));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function scoutingSeasonId(history, schedule) {
  const published = String(schedule?.seasonId || "").trim();
  if (published && (history.seasons || []).some(season => season.seasonId === published)) {
    return published;
  }
  // The archive is chronologically sorted, but only indexed seasons qualify.
  return (history.seasons || []).at(-1)?.seasonId || "";
}

export function scoutingFixtures(schedule = {}) {
  const matches = (Array.isArray(schedule?.teams) ? schedule.teams : [])
    .flatMap(team => (Array.isArray(team?.matches) ? team.matches : [])
      .map(game => ({
        team: game.team || team.name,
        opponent: game.opponent,
        date: game.date || "",
      })));
  return matches.filter(game => game.team && game.opponent).slice(0, 300);
}

export function projectRatsScouting({
  historyFile = "league/state/history.json",
  scheduleFile = "league/state/schedule.json",
  outputFile = SCOUTING_FILE,
  now = new Date(),
} = {}) {
  const history = readEncryptedJson(historyFile);
  if (!history || !Array.isArray(history.seasons) || !history.seasons.length) {
    throw new Error("Cannot project RATS scouting without indexed public results.");
  }
  const schedule = readEncryptedJson(scheduleFile) || {};
  const seasonId = scoutingSeasonId(history, schedule);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const projection = buildScoutingSnapshot(history, seasonId, today, scoutingFixtures(schedule));
  if (!projection.cards.length) {
    throw new Error("Scouting projection had no current-season teams; retained existing snapshot.");
  }
  const prior = readEncryptedJson(outputFile);
  // Do not rewrite identical results on every invocation. Retain published
  // source time rather than displaying a new 'updated' time for unchanged data.
  if (prior?.schemaVersion === projection.schemaVersion &&
      prior?.seasonId === projection.seasonId &&
      prior?.sourceUpdatedAt === projection.sourceUpdatedAt &&
      prior?.cards?.length === projection.cards.length &&
      prior?.reports?.length === projection.reports.length &&
      prior?.fixtureKey === projection.fixtureKey) {
    return { changed: false, cards: prior.cards.length, reports: prior.reports.length };
  }
  fs.mkdirSync("league/state", { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(encryptState(projection)) + "\n");
  return { changed: true, cards: projection.cards.length, reports: projection.reports.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = projectRatsScouting();
  console.log(`Hourly encrypted scouting snapshot ${result.changed ? "updated" : "unchanged"}: ${result.cards} teams, ${result.reports} reports.`);
}
