/**
 * Fetches and validates Seattle RATS schedules with bounded transient recovery.
 *
 * The watcher retries only transient source failures and may retain an already-validated
 * last-good schedule. Cold starts, auth/configuration errors, and schema/integrity
 * failures remain fail-closed. Runtime snapshots are transient and encrypted elsewhere.
 */
import { appendVenueObservations, matchVenue } from "../shared/venue-directory.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  dateInZone,
  digest,
  instantToZonedIso,
  normalizeText,
  TZ,
  zonedIso,
} from "./rats-utils.mjs";

const SEASONS = ["winter", "spring", "summer", "fall"];
export const SOURCE = "https://seattlerats.org/standings";
export const API = "https://service.rats.team.op-dev.io/";
export const CALENDAR_TRACKING_KEY_VERSION = "v2";
const TEAM_CONFIG = "teams.json";
export const HEADERS = [
  "Event Type",
  "Start Date",
  "Start Time",
  "End Date",
  "End Time",
  "Timezone ID",
  "Home or Away",
  "Opponent/Event Title",
  "Location Name",
  "Shirt Color",
  "Opponent Shirt Color",
  "Allow RSVPs",
  "Send Reminders",
  "Notes/Comments",
];

export class HttpError extends Error {
  constructor(status, message = `HTTP ${status}`) {
    super(message);
    this.name = "HttpError";
    this.status = Number(status);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return;
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
}

export function calendarFingerprint(game) {
  const schedule = Object.fromEntries(
    Object.entries(game).filter(
      ([key]) => !["teamScore", "opponentScore", "calendarFingerprint"].includes(key),
    ),
  );
  return digest(schedule);
}

export function seasonLabel(seasonId) {
  const [name, year] = String(seasonId).split("-", 2);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function yearInZone(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {timeZone: TZ, year: "numeric"}).format(now),
  );
}

export function seasonCandidates(now = new Date()) {
  const year = yearInZone(now);
  const candidates = [];
  for (let current = year + 1; current >= year - 1; current -= 1) {
    for (const name of [...SEASONS].reverse()) {
      candidates.push(`${name}-${current}`);
    }
  }
  return candidates;
}

export function normalizeTeamName(name) {
  return normalizeText(name);
}

export function configuredTeams(configFile = TEAM_CONFIG) {
  const data = readJson(configFile);
  const teams = data.teams;
  if (
    !Array.isArray(teams) ||
    !teams.length ||
    teams.some((name) => typeof name !== "string" || !name.trim())
  ) {
    throw new Error("teams.json must contain a non-empty teams array of names");
  }
  const cleaned = teams.map((name) => name.trim().split(/\s+/).join(" "));
  const normalized = cleaned.map(normalizeTeamName);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("teams.json contains duplicate team names after normalization");
  }
  return cleaned;
}

export function teamMatches(aggregate, teamName) {
  return (aggregate?.teams || []).filter(
    (team) => normalizeTeamName(team?.name || "") === normalizeTeamName(teamName),
  );
}

export function eventScore(event, side) {
  const explicit = [
    `${side}_score`,
    `${side}Score`,
    `${side}_goals`,
    `${side}Goals`,
    `score_${side}`,
    `goals_${side}`,
  ];
  for (const key of explicit) {
    if (key in event && event[key] !== null && event[key] !== "") return event[key];
  }

  const nested = event.score;
  if (typeof nested === "string") {
    const match = nested.match(/^\s*(\d+)\s*[-–—:]\s*(\d+)\s*$/);
    if (match) return Number(match[side === "home" ? 1 : 2]);
  }
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const key of [side, `${side}_score`, `${side}Score`]) {
      if (key in nested && nested[key] !== null && nested[key] !== "") return nested[key];
    }
  }

  for (const [key, value] of Object.entries(event)) {
    const normalized = String(key).toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
    if (
      normalized.includes(side) &&
      (normalized.includes("score") || normalized.includes("goal")) &&
      value !== null &&
      value !== "" &&
      ["string", "number"].includes(typeof value)
    ) {
      return value;
    }
  }
  return null;
}

export function isTransientSourceError(error) {
  let current = error;
  while (current) {
    if (current instanceof HttpError) {
      return [408, 429, 500, 502, 503, 504].includes(current.status);
    }
    if ([408, 429, 500, 502, 503, 504].includes(Number(current.status))) return true;
    if (["AbortError", "TimeoutError"].includes(current.name)) return true;
    if (
      ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH"].includes(
        current.code,
      )
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function call(
  action,
  params,
  {
    fetchImpl = globalThis.fetch,
    sleepFn = sleep,
    maxAttempts = 4,
    timeoutMs = 30_000,
  } = {},
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(API + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "rats-league-watcher/1.0",
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new HttpError(response.status);
      return await response.json();
    } catch (error) {
      if (!isTransientSourceError(error) || attempt === maxAttempts - 1) throw error;
      await sleepFn(2 ** attempt * 1000);
    }
  }
  throw new Error("Unreachable RATS retry state");
}

export async function discoverLatestSeason(
  preferred = null,
  {
    teamNames = configuredTeams(),
    callFn = call,
    now = new Date(),
  } = {},
) {
  let lastError = null;
  const candidates = [];
  const preferredSeason =
    typeof preferred === "string" && preferred.trim() ? preferred.trim() : null;
  if (preferredSeason) candidates.push(preferredSeason);
  for (const season of seasonCandidates(now)) {
    if (!candidates.includes(season)) candidates.push(season);
  }

  for (const seasonId of candidates) {
    let aggregate;
    try {
      aggregate = await callFn("get-aggregate", {season: seasonId});
    } catch (error) {
      lastError = error;
      // When the last validated season is temporarily unavailable, scanning older or
      // future seasons only amplifies the outage. Bubble the transient error so the
      // caller can retain the verified last-good schedule immediately.
      if (seasonId === preferredSeason && isTransientSourceError(error)) throw error;
      continue;
    }
    if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate)) continue;
    const matched = teamNames.map((name) => teamMatches(aggregate, name));
    if (matched.every((items) => items.length === 1)) return [seasonId, aggregate];
  }

  throw new Error("No recent RATS season contains all configured teams", {cause: lastError});
}

export function edgeSignalAggregate(
  preferred = null,
  {
    teamNames = configuredTeams(),
    externalFallback = process.env.EXTERNAL_FALLBACK,
    file = "state/edge-signal.json",
  } = {},
) {
  if (String(externalFallback || "").toLocaleLowerCase("en-US") === "true") return null;
  if (!fs.existsSync(file)) return null;

  let signal;
  try {
    signal = readJson(file);
  } catch {
    return null;
  }
  const seasonId = String(signal.season || "").trim();
  if (preferred && seasonId !== preferred) return null;

  const aggregate = {teams: signal.teams, events: signal.events};
  if (!Array.isArray(aggregate.teams) || !Array.isArray(aggregate.events)) return null;
  const matched = teamNames.map((name) => teamMatches(aggregate, name));
  if (!matched.every((items) => items.length === 1 && items[0].schedule_key)) return null;
  return [seasonId, aggregate];
}

function rowsEqual(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function rowObject(row) {
  return Object.fromEntries(HEADERS.map((header, index) => [header, row[index]]));
}

function quoteLikePython(value) {
  return encodeURIComponent(String(value))
    .replace(/%2F/gi, "/")
    .replace(/'/g, "%27");
}

// RATS fields may carry a published venue/navigation link in addition to the
// exported Location Name. Keep only recognized public map/RATS URLs.
export function validPublishedVenueUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 1200) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    const google = (host === "google.com" || host.endsWith(".google.com")) &&
      (url.pathname.startsWith("/maps") || host.startsWith("maps."));
    const shortMap = host === "maps.app.goo.gl" || host === "goo.gl" && url.pathname.startsWith("/maps");
    const rats = host === "seattlerats.org" || host === "www.seattlerats.org";
    return google || shortMap || rats ? url.href : "";
  } catch {
    return "";
  }
}

export function publishedVenueUrl(event = {}) {
  const venue = event?.venue && typeof event.venue === "object" ? event.venue : {};
  const field = event?.field && typeof event.field === "object" ? event.field : {};
  const location = event?.location_details && typeof event.location_details === "object" ? event.location_details : {};
  const fields = [
    field.url, field.link, field.maps_url, field.google_maps_url,
    location.url, location.link, location.maps_url, location.google_maps_url,
    event.location_url, event.locationUrl, event.location_link, event.locationLink,
    event.maps_url, event.mapsUrl, event.map_url, event.mapUrl,
    event.google_maps_url, event.googleMapsUrl,
    event.venue_url, event.venueUrl, event.directions_url, event.directionsUrl,
    event.location_href, event.locationHref, event.venue_link, event.venueLink,
    event.field_url, event.fieldUrl, event.field_map_url, event.fieldMapUrl,
    venue.url, venue.maps_url, venue.google_maps_url, venue.map_url, venue.link,
  ];
  for (const value of fields) {
    const url = validPublishedVenueUrl(value);
    if (url) return url;
  }
  for (const text of [event.location, event.notes]) {
    const urls = String(text || "").match(/https:\/\/[^\s<>"']+/g) || [];
    for (const raw of urls) {
      const url = validPublishedVenueUrl(raw.replace(/[),.;]+$/, ""));
      if (url) return url;
    }
  }
  return "";
}

export function publishedVenueCoordinates(event = {}) {
  const venue = event?.venue && typeof event.venue === "object" ? event.venue : {};
  const field = event?.field && typeof event.field === "object" ? event.field : {};
  const pairs = [
    [field.latitude, field.longitude],
    [field.lat, field.lng],
    [event.latitude, event.longitude],
    [event.lat, event.lng],
    [event.lat, event.lon],
    [event.location_latitude, event.location_longitude],
    [venue.latitude, venue.longitude],
    [venue.lat, venue.lng],
    [venue.lat, venue.lon],
  ];
  for (const [lat, lon] of pairs) {
    if (lat == null || lon == null || lat === "" || lon === "") continue;
    const latitude = Number(lat), longitude = Number(lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
        !(latitude === 0 && longitude === 0)) return { latitude, longitude };
  }
  return null;
}

// Some RATS schedule pages publish the clickable field destination in their
// venue catalogue rather than on each fixture event. Resolve only a strong,
// qualifier-preserving match (north/south and numbered pitches never mix).
export function aggregateVenueDirectory(aggregate = {}) {
  const observations = [];
  for (const key of ["venues", "fields", "locations", "field_locations", "venue_list"]) {
    const source = aggregate?.[key];
    const entries = Array.isArray(source) ? source.map(value => ["", value])
      : source && typeof source === "object" ? Object.entries(source) : [];
    for (const [fallbackName, value] of entries.slice(0, 2000)) {
      const item = typeof value === "string" ? {url: value} : value;
      if (!item || typeof item !== "object") continue;
      const name = item.name || item.field_name || item.venue_name ||
        item.location_name || item.title || item.label || fallbackName;
      if (!name) continue;
      observations.push({
        name,
        url: publishedVenueUrl(item),
        coordinates: publishedVenueCoordinates(item),
      });
    }
  }
  return appendVenueObservations({}, observations).directory;
}

export function normalize(
  seasonId,
  aggregate,
  exportsByTeam,
  {teamNames = configuredTeams()} = {},
) {
  if (
    !aggregate ||
    typeof aggregate !== "object" ||
    !Array.isArray(aggregate.teams) ||
    !Array.isArray(aggregate.events)
  ) {
    throw new Error("Unrecognized aggregate schema");
  }

  const publishedFields = aggregateVenueDirectory(aggregate);
  const result = [];
  for (const teamName of teamNames) {
    const matches = teamMatches(aggregate, teamName);
    if (matches.length !== 1) throw new Error("Configured team missing or ambiguous");
    const team = matches[0];
    const publishedTeamName = team.name || teamName;
    const table = exportsByTeam[teamName];

    if (!Array.isArray(table) || !table.length || !rowsEqual(table[0], HEADERS)) {
      throw new Error("Unrecognized team export schema");
    }
    if (table.slice(1).some((row) => !Array.isArray(row) || row.length !== HEADERS.length)) {
      throw new Error("Malformed team export row");
    }
    const exportRows = table.slice(1).map(rowObject);
    const exportGames = exportRows.filter(
      (row) => String(row["Event Type"]).toLocaleLowerCase("en-US") !== "bye",
    );

    const division = `${team.day} ${team.gender} D-${team.division}`;
    const divisionTeams = new Map(
      aggregate.teams
        .filter(
          (candidate) =>
            `${candidate.day} ${candidate.gender} D-${candidate.division}` === division,
        )
        .map((candidate) => [candidate.name, candidate]),
    );

    const games = [];
    for (const event of aggregate.events) {
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new Error("Malformed event");
      }
      const eventHome = event.home_team_name || "";
      const eventAway = event.away_team_name || "";
      if (
        ![normalizeTeamName(eventHome), normalizeTeamName(eventAway)].includes(
          normalizeTeamName(publishedTeamName),
        )
      ) {
        continue;
      }

      const home = normalizeTeamName(eventHome) === normalizeTeamName(publishedTeamName);
      const opponent = event[home ? "away_team_name" : "home_team_name"];
      const date = event.start_date;
      const clock = event.start_time;
      if (!opponent || !date) throw new Error("Missing match identity/date");

      const year = Number(String(date).slice(0, 4));
      const seasonYear = Number(String(seasonId).split("-").at(-1));
      if (![seasonYear, seasonYear + 1].includes(year)) {
        throw new Error("Unexpected match year for selected season");
      }

      const expectedSide = home ? "home" : "away";
      const dateSideRows = exportGames.filter(
        (row) =>
          row["Start Date"] === date &&
          String(row["Home or Away"]).toLocaleLowerCase("en-US") === expectedSide,
      );
      const normalizedRows = dateSideRows.filter(
        (row) =>
          normalizeTeamName(row["Opponent/Event Title"]) === normalizeTeamName(opponent),
      );
      const rows = dateSideRows.filter((row) => row["Opponent/Event Title"] === opponent);
      if (rows.length !== 1) {
        const sameOpponent = exportGames.filter(
          (row) =>
            normalizeTeamName(row["Opponent/Event Title"]) === normalizeTeamName(opponent),
        );

        // The aggregate can briefly contain future/unpublished events that are absent from
        // the team's published export. Ignore only those true aggregate-only extras. Any
        // export-backed identity disagreement still fails closed below.
        if (!rows.length && !dateSideRows.length && !sameOpponent.length) continue;

        throw new Error(
          "Aggregate/export match identity mismatch " +
          `(exact=${rows.length}, normalized=${normalizedRows.length}, ` +
          `dateSide=${dateSideRows.length}, opponent=${sameOpponent.length})`,
        );
      }
      const row = rows[0];
      if (
        clock !== row["Start Time"] ||
        (event.location || "") !== row["Location Name"] ||
        (event.notes || "") !== row["Notes/Comments"]
      ) {
        throw new Error("Source changed during fetch; retry next refresh");
      }

      let homeColor = event.home_color;
      if (homeColor === event.away_color) {
        homeColor = divisionTeams.get(event.home_team_name)?.color_alt || homeColor;
      }
      const ownColor = home ? homeColor : event.away_color;
      const otherColor = home ? event.away_color : homeColor;

      const start = clock ? zonedIso(date, clock, TZ) : null;
      const publishedEnd = row["End Time"] || null;
      const endDate = row["End Date"] || date;
      let end = null;
      if (publishedEnd && start) {
        end = zonedIso(endDate, publishedEnd, TZ);
        if (new Date(end) <= new Date(start)) throw new Error("Invalid published end time");
      } else if (start) {
        end = instantToZonedIso(new Date(new Date(start).getTime() + 2 * 60 * 60 * 1000), TZ);
      }

      const homeScore = eventScore(event, "home");
      const awayScore = eventScore(event, "away");
      const teamScore = home ? homeScore : awayScore;
      const opponentScore = home ? awayScore : homeScore;
      const sourceId = event.id || event.event_id || null;
      const identity =
        `${seasonId}|${division}|${normalizeTeamName(publishedTeamName)}|` +
        `${opponent}|${home ? "home" : "away"}|${date}`;
      const rawKey = sourceId ? String(sourceId) : digest(identity).slice(0, 24);

      const catalogued = matchVenue(publishedFields, event.location);
      const sourceVenueUrl = publishedVenueUrl(event) || catalogued?.url || "";
      const sourceCoordinates = publishedVenueCoordinates(event) || catalogued?.coordinates || null;
      const game = {
        key: `${CALENDAR_TRACKING_KEY_VERSION}:${rawKey}`,
        sourceMatchId: sourceId ? String(sourceId) : null,
        identityBasis: sourceId ? "source-id" : "team-opponent-side-date",
        team: publishedTeamName,
        opponent,
        homeAway: home ? "home" : "away",
        date,
        startTime: clock || null,
        endTime: publishedEnd,
        start,
        end,
        endEstimated: !publishedEnd,
        timezone: TZ,
        location: event.location || null,
        locationUrl: sourceVenueUrl,
        venueCoordinates: sourceCoordinates,
        fieldNotes: event.notes || null,
        jerseyColor: ownColor || null,
        opponentJerseyColor: otherColor || null,
        teamScore,
        opponentScore,
        division,
        season: seasonLabel(seasonId),
        sourceUrl: SOURCE,
        mapUrl: sourceVenueUrl || (event.location
          ? "https://maps.google.com/?q=" + quoteLikePython(event.location)
          : null),
        eventType: row["Event Type"],
      };
      game.calendarFingerprint = calendarFingerprint(game);
      games.push(game);
    }

    if (games.length !== exportGames.length) {
      throw new Error("Aggregate/export game count mismatch");
    }
    if (new Set(games.map((game) => game.key)).size !== games.length) {
      throw new Error("Ambiguous duplicate match identities");
    }
    games.sort(
      (left, right) =>
        String(left.date).localeCompare(String(right.date)) ||
        String(left.startTime || "").localeCompare(String(right.startTime || "")) ||
        String(left.key).localeCompare(String(right.key)),
    );
    result.push({
      name: publishedTeamName,
      day: team.day,
      division,
      publishedMatchCount: games.length,
      regularSeasonDiscoveryComplete: games.length >= 10,
      matches: games,
    });
  }

  return {
    schemaVersion: 1,
    ok: true,
    season: seasonLabel(seasonId),
    seasonId,
    timezone: TZ,
    sourceUrl: SOURCE,
    teams: result,
  };
}

export function validPreviousSchedule(value) {
  return Boolean(value && typeof value === "object" && value.ok === true && Array.isArray(value.teams));
}

export function canRetainPreviousSchedule(error, previous) {
  return validPreviousSchedule(previous) && isTransientSourceError(error);
}

export async function runWatcher({
  now = new Date(),
  callFn = call,
} = {}) {
  let previous = null;
  try {
    previous = fs.existsSync("schedule.json") ? readJson("schedule.json") : null;
    const preferredSeason = previous && typeof previous === "object" ? previous.seasonId : null;
    const edge = edgeSignalAggregate(preferredSeason);
    let seasonId;
    let aggregate;
    if (edge) {
      [seasonId, aggregate] = edge;
      console.log("Using fresh Cloudflare RATS signal; skipped duplicate aggregate fetch.");
    } else {
      [seasonId, aggregate] = await discoverLatestSeason(preferredSeason, {callFn, now});
    }

    const teams = configuredTeams();
    const scheduleKeys = {};
    for (const teamName of teams) {
      const team = teamMatches(aggregate, teamName)[0];
      if (!team?.schedule_key) throw new Error("Team schedule key missing");
      scheduleKeys[teamName] = team.schedule_key;
    }

    const pairs = await Promise.all(
      Object.entries(scheduleKeys).map(async ([teamName, key]) => [
        teamName,
        await callFn("get-schedule", {season: seasonId, key}),
      ]),
    );
    const exportsByTeam = Object.fromEntries(pairs);
    const payload = normalize(seasonId, aggregate, exportsByTeam, {teamNames: teams});

    const scoreUpdates = [];
    if (previous?.seasonId === payload.seasonId) {
      const oldMatches = new Map(
        (previous.teams || []).flatMap((team) =>
          (team.matches || []).map((match) => [match.key, match]),
        ),
      );
      for (const team of payload.teams || []) {
        for (const match of team.matches || []) {
          const old = oldMatches.get(match.key);
          if (!old) continue;
          if (!("teamScore" in old) && !("opponentScore" in old)) continue;
          const before = [old.teamScore ?? null, old.opponentScore ?? null];
          const after = [match.teamScore ?? null, match.opponentScore ?? null];
          if (
            (before[0] !== after[0] || before[1] !== after[1]) &&
            !(after[0] === null && after[1] === null)
          ) {
            scoreUpdates.push({
              match,
              previousTeamScore: before[0],
              previousOpponentScore: before[1],
            });
          }
        }
      }
    }
    writeJson("score-changes.json", {updates: scoreUpdates});

    if (previous?.seasonId === payload.seasonId) {
      const counts = new Map(
        (previous.teams || []).map((team) => [team.name, team.publishedMatchCount]),
      );
      if (
        payload.teams.some(
          (team) => team.publishedMatchCount < (counts.get(team.name) ?? 0),
        )
      ) {
        throw new Error("Published match count shrank; preserve last good snapshot for review");
      }
    }

    payload.contentHash = digest(payload);
    payload.updatedAt = instantToZonedIso(now, TZ);
    const today = dateInZone(now, TZ);
    const todayGames = (payload.teams || [])
      .flatMap((team) => team.matches || [])
      .filter((match) => match.date === today);
    writeJson("today.json", {
      schemaVersion: 1,
      ok: true,
      date: today,
      timezone: TZ,
      season: payload.season,
      seasonId: payload.seasonId,
      games: todayGames,
      updatedAt: payload.updatedAt,
    });
    writeJson("schedule.json", payload);
    console.log(
      `Validated published match counts: [${payload.teams.map((team) => team.publishedMatchCount).join(", ")}]`,
    );
    return payload;
  } catch (error) {
    if (canRetainPreviousSchedule(error, previous)) {
      const smoke = String(process.env.SMOKE_ALLOW_TRANSIENT_SOURCE_FAILURE || "")
        .toLocaleLowerCase("en-US") === "true";
      console.log(
        "::warning::RATS source temporarily unavailable; " +
        `retained last good runtime schedule (${smoke ? "smoke" : "production"}).`,
      );
      return previous;
    }
    throw new Error("RATS refresh failed; retained last good runtime-state snapshot", {
      cause: error,
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWatcher();
}
