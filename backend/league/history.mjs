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
import { captureVenueEvents } from "./venue-cache.mjs";

export const HISTORY_FILE = "league/state/history.json";
export const HISTORY_START_YEAR = 2023;
export const HISTORY_REFRESH_MS = 24 * 60 * 60 * 1000;
export const HISTORY_RETRY_MS = 30 * 60 * 1000;
export const HISTORY_BATCH_SIZE = 4;
export const HISTORY_MAX_ATTEMPTS_PER_SEASON = 3;
const SEASONS = ["winter", "spring", "summer", "fall"];

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
  const floor = Math.max(HISTORY_START_YEAR, Number(startYear) || HISTORY_START_YEAR);
  const ids = [];
  for (let year = endYear; year >= floor; year -= 1) {
    for (const season of [...SEASONS].reverse()) {
      if (year === HISTORY_START_YEAR && ["winter", "spring"].includes(season)) continue;
      ids.push(`${season}-${year}`);
    }
  }
  return ids;
}

export function historyRefreshDue(
  history,
  now = new Date(),
  maxAgeMs = HISTORY_REFRESH_MS,
) {
  if (!history || Number(history?.schemaVersion || 0) < 3) return true;
  if (Array.isArray(history?.scan?.pendingSeasonIds) && history.scan.pendingSeasonIds.length) {
    return true;
  }
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
  {
    requestedSeasonCount = seasons.length,
    checkedSeasonCount = seasons.length,
    failedSeasonIds = [],
  } = {},
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
    checkedSeasonCount,
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
    maxAttempts: 1,
    timeoutMs: 15_000,
  });
}

function normalizedScanState(previous, seasonIds, { force = false } = {}) {
  const previousScan = Number(previous?.schemaVersion || 0) >= 3 && previous?.scan
    ? previous.scan
    : null;
  if (force || !previousScan) {
    return {
      pendingSeasonIds: [...seasonIds],
      checkedSeasonIds: [],
      unresolvedSeasonIds: [],
      attemptCounts: {},
    };
  }

  const allowed = new Set(seasonIds);
  const checked = new Set(
    (previousScan.checkedSeasonIds || []).filter((seasonId) => allowed.has(seasonId)),
  );
  const unresolved = new Set(
    (previousScan.unresolvedSeasonIds || []).filter((seasonId) => allowed.has(seasonId)),
  );
  let pending = (previousScan.pendingSeasonIds || [])
    .filter((seasonId) => allowed.has(seasonId));
  const known = new Set([...checked, ...unresolved, ...pending]);
  pending.push(...seasonIds.filter((seasonId) => !known.has(seasonId)));

  if (!pending.length) {
    if (previous?.coverage?.complete === false && unresolved.size) {
      pending = [...unresolved];
      unresolved.clear();
    } else {
      pending = [...seasonIds];
      checked.clear();
      unresolved.clear();
    }
  }

  const attemptCounts = {};
  for (const [seasonId, count] of Object.entries(previousScan.attemptCounts || {})) {
    if (allowed.has(seasonId)) attemptCounts[seasonId] = Number(count) || 0;
  }
  return {
    pendingSeasonIds: pending,
    checkedSeasonIds: [...checked],
    unresolvedSeasonIds: [...unresolved],
    attemptCounts,
  };
}

export async function refreshRatsHistory({
  now = new Date(),
  callFn = defaultHistoryCall,
  file = HISTORY_FILE,
  force = String(process.env.RATS_HISTORY_FORCE || "").toLowerCase() === "true",
  startYear = Number(process.env.RATS_HISTORY_START_YEAR || HISTORY_START_YEAR),
} = {}) {
  const previous = readEncryptedHistory(file);
  if (previous) {
    console.log(
      `RATS history resume: schema ${Number(previous.schemaVersion || 0)}, ` +
      `${Number(previous?.coverage?.seasonCount || previous?.seasons?.length || 0)} seasons, ` +
      `${previous?.scan?.pendingSeasonIds?.length || 0} pending, ` +
      `${previous?.scan?.unresolvedSeasonIds?.length || 0} unresolved, ` +
      `${Object.keys(previous?.scan?.attemptCounts || {}).length} retry counters.`,
    );
  } else {
    console.warn("::warning::RATS history resume state could not be read; starting a fresh scan.");
  }
  // Upgrade pre-Summer-2023 archives without re-downloading already indexed games.
  // These two seasons never existed in the RATS public archive.
  const expectedIds = new Set(historySeasonIds(now, startYear));
  if (!force && previous?.schemaVersion >= 3 &&
      (previous?.scan?.unresolvedSeasonIds || []).some((id) => !expectedIds.has(id)) &&
      (previous?.scan?.pendingSeasonIds || []).every((id) => expectedIds.has(id))) {
    const scan = previous.scan;
    const retainedSeasons = (previous.seasons || []).filter((season) => expectedIds.has(season.seasonId));
    const unresolvedSeasonIds = (scan.unresolvedSeasonIds || []).filter((id) => expectedIds.has(id));
    const pendingSeasonIds = (scan.pendingSeasonIds || []).filter((id) => expectedIds.has(id));
    const checkedSeasonIds = (scan.checkedSeasonIds || []).filter((id) => expectedIds.has(id));
    const failedSeasonIds = [...new Set([...pendingSeasonIds, ...unresolvedSeasonIds])];
    const migrated = {
      ...previous,
      updatedAt: now.toISOString(),
      scan: { ...scan, pendingSeasonIds, unresolvedSeasonIds, checkedSeasonIds,
        attemptCounts: Object.fromEntries(
          Object.entries(scan.attemptCounts || {}).filter(([id]) => expectedIds.has(id))) },
      coverage: coverageFor(retainedSeasons, {
        requestedSeasonCount: expectedIds.size,
        checkedSeasonCount: checkedSeasonIds.length,
        failedSeasonIds,
      }),
      seasons: retainedSeasons,
    };
    writeEncryptedHistory(migrated, file);
    console.log(`RATS history coverage migrated: ${migrated.coverage.seasonCount}/${expectedIds.size} valid seasons.`);
    return migrated;
  }
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
  const batchSize = Math.max(
    1,
    Math.min(
      Number(process.env.RATS_HISTORY_BATCH_SIZE || HISTORY_BATCH_SIZE) || HISTORY_BATCH_SIZE,
      seasonIds.length || 1,
    ),
  );
  const scan = normalizedScanState(previous, seasonIds, { force });
  const pending = [...scan.pendingSeasonIds];
  const checked = new Set(scan.checkedSeasonIds);
  const unresolved = new Set(scan.unresolvedSeasonIds);
  const attemptCounts = { ...scan.attemptCounts };
  const seasonById = new Map(previousBySeason);
  const batch = pending.splice(0, batchSize);
  let successfulFetches = 0;

  for (const seasonId of batch) {
    try {
      const aggregate = await callFn("get-aggregate", { season: seasonId });
      const normalized = normalizeHistoryAggregate(seasonId, aggregate);
      if (process.env.TRACKER_STATE_KEY && normalized) captureVenueEvents(aggregate.events);
      successfulFetches += 1;
      checked.add(seasonId);
      unresolved.delete(seasonId);
      delete attemptCounts[seasonId];
      if (normalized) seasonById.set(seasonId, normalized);
      else seasonById.delete(seasonId);
    } catch (error) {
      const attempts = (Number(attemptCounts[seasonId]) || 0) + 1;
      const status = Number(error?.status || error?.cause?.status || 0);
      const detail = status
        ? `HTTP ${status}`
        : String(error?.code || error?.name || error?.message || "unknown error")
          .replace(/\s+/g, " ")
          .slice(0, 120);
      console.warn(
        `::warning::RATS history fetch failed for ${seasonId}: ${detail} ` +
        `(attempt ${attempts}/${HISTORY_MAX_ATTEMPTS_PER_SEASON})`,
      );
      if (attempts >= HISTORY_MAX_ATTEMPTS_PER_SEASON) {
        unresolved.add(seasonId);
        delete attemptCounts[seasonId];
      } else {
        attemptCounts[seasonId] = attempts;
        pending.push(seasonId);
      }
    }
  }

  const allowedSeasons = new Set(seasonIds);
  const seasons = [...seasonById.values()]
    .filter((season) => allowedSeasons.has(season?.seasonId))
    .sort((a, b) => seasonOrder(a.seasonId) - seasonOrder(b.seasonId));

  const failedSeasonIds = [...new Set([...pending, ...unresolved])];
  const history = {
    schemaVersion: 3,
    sourceUrl: SOURCE,
    sourceApi: API,
    scanStartYear: startYear,
    scanEndYear: now.getUTCFullYear(),
    updatedAt: now.toISOString(),
    scan: {
      pendingSeasonIds: pending,
      checkedSeasonIds: [...checked].sort(),
      unresolvedSeasonIds: [...unresolved].sort(),
      attemptCounts,
    },
    coverage: coverageFor(seasons, {
      requestedSeasonCount: seasonIds.length,
      checkedSeasonCount: checked.size,
      failedSeasonIds,
    }),
    seasons,
  };

  if (!successfulFetches && !seasons.length) {
    writeEncryptedHistory(history, file);
    console.log("::warning::RATS history scan has no usable season yet; continuing next run.");
    return history;
  }

  writeEncryptedHistory(history, file);
  console.log(
    `Refreshed RATS history: ${history.coverage.seasonCount} seasons, ` +
    `${history.coverage.teamCount} teams, ${history.coverage.completedMatchCount} scored matches, ` +
    `${history.scan.pendingSeasonIds.length} pending seasons, ` +
    `${history.scan.unresolvedSeasonIds.length} unresolved seasons.`,
  );
  return history;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await refreshRatsHistory();
}
