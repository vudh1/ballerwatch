/**
 * Builds the encrypted all-team Seattle RATS historical-results index.
 *
 * The source is the same public RATS aggregate API used by the live league watcher.
 * Only public team/game facts are retained; the durable runtime file is always encrypted.
 * Added in v7.1.0.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  API,
  SOURCE,
  call,
  eventScore,
  seasonLabel,
} from "./watcher.mjs";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";

export const HISTORY_FILE = "league/state/history.json";
export const HISTORY_START_YEAR = 2023;
export const HISTORY_REFRESH_MS = 24 * 60 * 60 * 1000;
export const HISTORY_RETRY_MS = 30 * 60 * 1000;
const SEASONS = ["winter", "spring", "summer", "fall"];
const HISTORY_CONCURRENCY = 2;

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function numericScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function seasonOrder(seasonId) {
  const match = String(seasonId || "").match(/^(winter|spring|summer|fall)-(\d{4})$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) * 10 + SEASONS.indexOf(match[1].toLowerCase());
}

export function historySeasonIds(
  now = new Date(),
  startYear = HISTORY_START_YEAR,
) {
  const endYear = now.getUTCFullYear();
  const ids = [];
  for (
    let year = Math.max(HISTORY_START_YEAR, Number(startYear) || HISTORY_START_YEAR);
    year <= endYear;
    year += 1
  ) {
    for (const season of SEASONS) ids.push(`${season}-${year}`);
  }
  return ids;
}

export function historyRefreshDue(
  history,
  now = new Date(),
  maxAgeMs = HISTORY_REFRESH_MS,
) {
  if (!history || Number(history?.schemaVersion || 0) < 2) return true;
  if (Number(history?.coverage?.completedMatchCount || 0) <= 0) return true;

  const updated = Date.parse(String(history?.updatedAt || ""));
  if (!Number.isFinite(updated)) return true;

  const interval = history?.coverage?.complete === false
    ? Math.min(maxAgeMs, HISTORY_RETRY_MS)
    : maxAgeMs;
  return now.getTime() - updated >= interval;
}

function teamDivision(team) {
  return [team?.day, team?.gender, team?.division ? `D-${team.division}` : ""]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

export function normalizeHistoryAggregate(seasonId, aggregate) {
  if (
    !aggregate ||
    typeof aggregate !== "object" ||
    !Array.isArray(aggregate.teams) ||
    !Array.isArray(aggregate.events)
  ) {
    throw new Error("Unrecognized RATS historical aggregate schema");
  }

  const teams = aggregate.teams
    .map((team) => ({
      name: cleanText(team?.name),
      day: cleanText(team?.day),
      gender: cleanText(team?.gender),
      division: cleanText(team?.division),
      divisionLabel: teamDivision(team),
    }))
    .filter((team) => team.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!teams.length) return null;

  const seen = new Set();
  const matches = [];
  for (const event of aggregate.events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) continue;
    const homeTeam = cleanText(event.home_team_name);
    const awayTeam = cleanText(event.away_team_name);
    const date = cleanText(event.start_date);
    if (!homeTeam || !awayTeam || !date) continue;

    const sourceId = cleanText(event.id || event.event_id);
    const key = sourceId || [
      seasonId,
      homeTeam.toLowerCase(),
      awayTeam.toLowerCase(),
      date,
      cleanText(event.start_time),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    matches.push({
      id: sourceId,
      date,
      startTime: cleanText(event.start_time),
      homeTeam,
      awayTeam,
      homeScore: numericScore(eventScore(event, "home")),
      awayScore: numericScore(eventScore(event, "away")),
    });
  }

  matches.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.startTime.localeCompare(b.startTime) ||
    a.homeTeam.localeCompare(b.homeTeam) ||
    a.awayTeam.localeCompare(b.awayTeam));

  return {
    seasonId,
    label: seasonLabel(seasonId),
    teams,
    matches,
  };
}

function readEncryptedHistory(file = HISTORY_FILE) {
  try {
    const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
    const history = decryptState(envelope);
    return history && typeof history === "object" ? history : null;
  } catch {
    return null;
  }
}

function writeEncryptedHistory(history, file = HISTORY_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(encryptState(history), null, 2) + "\n");
}

function coverageFor(
  seasons,
  { requestedSeasonCount = seasons.length, failedSeasonIds = [] } = {},
) {
  const teams = new Set();
  let matchCount = 0;
  let completedMatchCount = 0;
  for (const season of seasons) {
    for (const team of season.teams || []) teams.add(cleanText(team?.name).toLowerCase());
    for (const match of season.matches || []) {
      matchCount += 1;
      if (numericScore(match?.homeScore) !== null && numericScore(match?.awayScore) !== null) {
        completedMatchCount += 1;
      }
    }
  }
  return {
    complete: failedSeasonIds.length === 0,
    requestedSeasonCount,
    checkedSeasonCount: Math.max(0, requestedSeasonCount - failedSeasonIds.length),
    failedSeasonCount: failedSeasonIds.length,
    unresolvedSeasonIds: [...failedSeasonIds].sort(),
    firstSeason: seasons[0]?.seasonId || "",
    lastSeason: seasons.at(-1)?.seasonId || "",
    seasonCount: seasons.length,
    teamCount: teams.size,
    matchCount,
    completedMatchCount,
  };
}

async function defaultHistoryCall(action, params) {
  return call(action, params, {
    maxAttempts: 2,
    timeoutMs: 15_000,
  });
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

export async function refreshRatsHistory({
  now = new Date(),
  callFn = defaultHistoryCall,
  file = HISTORY_FILE,
  force = String(process.env.RATS_HISTORY_FORCE || "").toLowerCase() === "true",
  startYear = Number(process.env.RATS_HISTORY_START_YEAR || HISTORY_START_YEAR),
} = {}) {
  const previous = readEncryptedHistory(file);
  if (!force && previous && !historyRefreshDue(previous, now)) {
    console.log(
      `RATS history index is fresh (${previous?.coverage?.seasonCount || 0} seasons); skipped refresh.`,
    );
    return previous;
  }

  const previousBySeason = new Map(
    (Array.isArray(previous?.seasons) ? previous.seasons : [])
      .map((season) => [season.seasonId, season]),
  );
  const seasonIds = historySeasonIds(now, startYear);
  let successfulFetches = 0;
  const failedSeasonIds = [];

  const scanned = await mapWithConcurrency(
    seasonIds,
    HISTORY_CONCURRENCY,
    async (seasonId) => {
      try {
        const aggregate = await callFn("get-aggregate", { season: seasonId });
        const normalized = normalizeHistoryAggregate(seasonId, aggregate);
        successfulFetches += 1;
        return normalized || previousBySeason.get(seasonId) || null;
      } catch {
        failedSeasonIds.push(seasonId);
        return previousBySeason.get(seasonId) || null;
      }
    },
  );

  if (!successfulFetches) {
    if (previous?.seasons?.length) {
      console.log("::warning::RATS history refresh failed; retained prior encrypted archive.");
      return previous;
    }
    throw new Error("RATS historical refresh could not read any public season aggregate");
  }

  const seasons = scanned
    .filter(Boolean)
    .sort((a, b) => seasonOrder(a.seasonId) - seasonOrder(b.seasonId));
  if (!seasons.length) {
    throw new Error("RATS historical refresh found no published seasons");
  }

  const history = {
    schemaVersion: 2,
    sourceUrl: SOURCE,
    sourceApi: API,
    scanStartYear: startYear,
    scanEndYear: now.getUTCFullYear(),
    updatedAt: now.toISOString(),
    coverage: coverageFor(seasons, {
      requestedSeasonCount: seasonIds.length,
      failedSeasonIds,
    }),
    seasons,
  };
  writeEncryptedHistory(history, file);
  console.log(
    `Refreshed RATS history: ${history.coverage.seasonCount} seasons, ` +
    `${history.coverage.teamCount} teams, ${history.coverage.completedMatchCount} scored matches, ` +
    `${history.coverage.failedSeasonCount} unresolved seasons.`,
  );
  return history;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await refreshRatsHistory();
}
