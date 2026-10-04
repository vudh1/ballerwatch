/**
 * Builds a 14-day public-safe match weather snapshot.
 *
 * Venue coordinates are cached in encrypted runtime state. New venues are geocoded
 * conservatively through OpenStreetMap Nominatim and forecasts use Open-Meteo.
 * Runtime/private data must never be committed to main.
 */
import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { loadUserSettings } from "../shared/user-state.mjs";
import {
  applyLeagueMatchOverride,
  applyPickupMatchOverride,
  pickupOverrideId,
} from "../shared/match-overrides.mjs";

const TIME_ZONE = "America/Los_Angeles";
const STATE_PATH = "state/weather.json";
const PICKUP_FEED_PATH = "pickup/state/feed.json";
const PICKUP_PRIVATE_PATH = "pickup/state/events.json";
const LEAGUE_PATH = "league/state/schedule.json";
const GEOCODE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const USER_AGENT = "BallerWatch/5.1 (https://github.com/vudh1/ballerwatch)";
const SEATTLE_WEATHER_FALLBACK = Object.freeze({
  latitude: 47.6062,
  longitude: -122.3321,
});

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readEncrypted(file, fallback) {
  const payload = readJson(file);
  const value = payload ? decryptState(payload) : null;
  return value && typeof value === "object" ? value : fallback;
}

function writeEncryptedIfChanged(file, value) {
  const previous = readEncrypted(file, null);
  if (JSON.stringify(previous) === JSON.stringify(value)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(encryptState(value), null, 2) + "\n");
  return true;
}

function datePartsInZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function dateInZone(now = new Date()) {
  const { year, month, day } = datePartsInZone(now);
  return `${year}-${month}-${day}`;
}

export function addDaysIso(date, days) {
  const [year, month, day] = String(date).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12));
  return next.toISOString().slice(0, 10);
}

function clean(value, max = 240) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function parseClockMinutes(value) {
  const text = clean(value, 40);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  const suffix = String(match[3] || "").toUpperCase();
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "AM" && hour === 12) hour = 0;
    if (suffix === "PM" && hour !== 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

function clockFromIso(value) {
  const parsed = new Date(String(value || ""));
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function minutesToClock(minutes) {
  const normalized = ((Number(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function gameWindow(startTime, endTime, startIso, endIso, fallbackMinutes) {
  const start = parseClockMinutes(startTime) ?? clockFromIso(startIso);
  if (start == null) return null;
  let end = parseClockMinutes(endTime) ?? clockFromIso(endIso);
  if (end == null) end = start + fallbackMinutes;
  if (end <= start) end += 1440;
  return {
    startMinute: start,
    endMinute: end,
    startTime: minutesToClock(start),
    endTime: minutesToClock(end),
  };
}

function locationQuery(game) {
  const address = clean(game.address, 220);
  if (address) return address;
  const location = clean(game.location, 180);
  return location ? `${location}, Seattle, WA, USA` : "";
}

function locationKey(query) {
  return clean(query, 260).toLocaleLowerCase("en-US");
}

function coordinatesForGame(game, locations) {
  const geo = locations[locationKey(game.locationQuery)];
  if (Number.isFinite(Number(geo?.latitude)) && Number.isFinite(Number(geo?.longitude))) {
    return {
      latitude: Number(geo.latitude),
      longitude: Number(geo.longitude),
      approximate: false,
      source: "venue",
    };
  }
  if (game.kind === "league") {
    return {
      ...SEATTLE_WEATHER_FALLBACK,
      approximate: true,
      source: "seattle-fallback",
    };
  }
  return null;
}

function gameId(kind, value) {
  return `${kind}:${clean(value, 300)}`;
}

export function collectUpcomingGames({
  pickupFeed = {},
  pickupPrivate = {},
  leagueSchedule = {},
  settings = {},
  now = new Date(),
  days = 14,
} = {}) {
  const startDate = dateInZone(now);
  const endDate = addDaysIso(startDate, Math.max(1, Number(days) || 14) - 1);
  const games = [];

  for (const sourceDate of Object.keys(pickupFeed?.events || {}).sort()) {
    const pub = pickupFeed.events[sourceDate] || {};
    const priv = pickupPrivate?.events?.[sourceDate] || {};
    const effective = applyPickupMatchOverride({
      id: pickupOverrideId(sourceDate),
      sourceDate,
      date: sourceDate,
      startTime: pub.startTime,
      endTime: pub.endTime,
      fieldName: priv.fieldName,
      address: priv.address,
    }, settings);
    const date = effective.date;
    if (date < startDate || date > endDate) continue;
    const location = clean(effective.fieldName, 180);
    const address = clean(effective.address, 220);
    if (!location && !address) continue;
    const window = gameWindow(effective.startTime, effective.endTime, "", "", 180);
    if (!window) continue;
    games.push({
      id: gameId("pickup", sourceDate),
      kind: "pickup",
      date,
      title: "Pickup",
      startTime: window.startTime,
      endTime: window.endTime,
      location,
      address,
      mapsQuery: address || location,
      reserved: Number.isFinite(Number(pub.reserved)) ? Number(pub.reserved) : null,
      capacity: Number.isFinite(Number(pub.capacity)) ? Number(pub.capacity) : null,
      locationQuery: locationQuery({ location, address }),
      manualOverride: Boolean(effective.manualOverride),
    });
  }

  for (const team of leagueSchedule?.teams || []) {
    for (const sourceMatch of team?.matches || []) {
      const match = applyLeagueMatchOverride(
        { ...sourceMatch, team: sourceMatch?.team || team?.name || "Team" },
        settings,
      );
      const date = clean(match?.date, 20);
      if (!date || date < startDate || date > endDate) continue;
      const window = gameWindow(
        match?.startTime,
        match?.endTime,
        match?.start,
        match?.end,
        120,
      );
      if (!window) continue;
      const location = clean(match?.location, 180);
      const key = clean(match?.key, 240) ||
        [team?.name, match?.opponent, date, window.startTime].map((value) => clean(value, 100)).join("|");
      games.push({
        id: gameId("league", key),
        kind: "league",
        date,
        title: `${clean(match?.team || team?.name, 100) || "Team"} vs ${clean(match?.opponent, 100) || "opponent"}`,
        team: clean(match?.team || team?.name, 100),
        opponent: clean(match?.opponent, 100),
        startTime: window.startTime,
        endTime: window.endTime,
        location,
        address: "",
        mapsQuery: location,
        jerseyColor: clean(match?.jerseyColor, 60),
        locationQuery: locationQuery({ location }),
      });
    }
  }

  games.sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.title.localeCompare(right.title),
  );
  return { startDate, endDate, games };
}

export function weatherCondition(code) {
  const value = Number(code);
  if (value === 0) return "Clear";
  if ([1, 2].includes(value)) return "Partly cloudy";
  if (value === 3) return "Cloudy";
  if ([45, 48].includes(value)) return "Fog";
  if (value >= 51 && value <= 57) return "Drizzle";
  if (value >= 61 && value <= 67) return "Rain";
  if (value >= 71 && value <= 77) return "Snow";
  if (value >= 80 && value <= 82) return "Showers";
  if (value >= 85 && value <= 86) return "Snow showers";
  if (value >= 95) return "Thunderstorms";
  return "Variable";
}

function localMinuteFromHourlyLabel(label, gameDate) {
  const base = Date.parse(`${gameDate}T00:00:00Z`);
  const slot = Date.parse(`${label}:00Z`);
  return Number.isFinite(base) && Number.isFinite(slot) ? (slot - base) / 60000 : null;
}

export function summarizeMatchWeather(game, hourly = {}) {
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const rain = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability
    : [];
  const temperatures = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const codes = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
  const start = parseClockMinutes(game.startTime);
  let end = parseClockMinutes(game.endTime);
  if (start == null || end == null) return null;
  if (end <= start) end += 1440;

  const slots = [];
  for (let index = 0; index < times.length; index += 1) {
    const minute = localMinuteFromHourlyLabel(times[index], game.date);
    if (minute == null || minute >= end || minute + 60 <= start) continue;
    slots.push({
      rain: Number(rain[index]),
      temperature: Number(temperatures[index]),
      code: Number(codes[index]),
    });
  }
  if (!slots.length) return null;

  const validRain = slots.map((slot) => slot.rain).filter(Number.isFinite);
  const validTemps = slots.map((slot) => slot.temperature).filter(Number.isFinite);
  const maxRain = validRain.length ? Math.max(...validRain) : null;
  const averageTemp = validTemps.length
    ? Math.round(validTemps.reduce((sum, value) => sum + value, 0) / validTemps.length)
    : null;
  let representative = slots[0];
  for (const slot of slots) {
    if ((slot.rain || 0) > (representative.rain || 0)) representative = slot;
  }

  return {
    rainProbability: maxRain == null ? null : Math.round(maxRain),
    temperatureF: averageTemp,
    weatherCode: Number.isFinite(representative.code) ? representative.code : null,
    condition: weatherCondition(representative.code),
  };
}

export async function geocodeVenue(query, {
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("q", query);
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const values = await response.json();
  const first = Array.isArray(values) ? values[0] : null;
  const latitude = Number(first?.lat);
  const longitude = Number(first?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    displayName: clean(first?.display_name, 300),
  };
}

export async function fetchForecast(latitude, longitude, {
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "hourly",
    "precipitation_probability,temperature_2m,weather_code",
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", TIME_ZONE);
  url.searchParams.set("forecast_days", "14");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const previous = readEncrypted(STATE_PATH, {
    locations: {},
    games: [],
  });
  const pickupFeed = readEncrypted(PICKUP_FEED_PATH, {});
  const pickupPrivate = readEncrypted(PICKUP_PRIVATE_PATH, {});
  const leagueSchedule = readEncrypted(LEAGUE_PATH, {});
  const settings = loadUserSettings();
  const { startDate, endDate, games } = collectUpcomingGames({
    pickupFeed,
    pickupPrivate,
    leagueSchedule,
    settings,
  });

  const locations = { ...(previous.locations || {}) };
  const nowIso = new Date().toISOString();
  const pending = [];
  for (const game of games) {
    const query = game.locationQuery;
    if (!query) continue;
    const key = locationKey(query);
    const cached = locations[key];
    const failedAt = Date.parse(String(cached?.failedAt || ""));
    if (
      cached?.latitude != null &&
      cached?.longitude != null
    ) {
      continue;
    }
    if (Number.isFinite(failedAt) && Date.now() - failedAt < GEOCODE_RETRY_MS) continue;
    if (!pending.some((item) => item.key === key)) pending.push({ key, query });
  }

  for (let index = 0; index < pending.length; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
    const item = pending[index];
    try {
      const result = await geocodeVenue(item.query);
      locations[item.key] = result
        ? { ...result, query: item.query, checkedAt: nowIso }
        : { query: item.query, failedAt: nowIso };
    } catch (error) {
      console.warn(`Weather geocode unavailable for one venue: ${error?.message || error}`);
      locations[item.key] = {
        ...(locations[item.key] || {}),
        query: item.query,
        failedAt: nowIso,
      };
    }
  }

  const forecastByCoordinate = new Map();
  for (const game of games) {
    const coordinates = coordinatesForGame(game, locations);
    if (!coordinates) continue;
    const coordinateKey = `${coordinates.latitude},${coordinates.longitude}`;
    if (forecastByCoordinate.has(coordinateKey)) continue;
    try {
      forecastByCoordinate.set(
        coordinateKey,
        await fetchForecast(coordinates.latitude, coordinates.longitude),
      );
    } catch (error) {
      console.warn(`Weather forecast unavailable for one venue: ${error?.message || error}`);
      forecastByCoordinate.set(coordinateKey, null);
    }
  }

  const previousGames = new Map((previous.games || []).map((game) => [game.id, game]));
  const enriched = games.map((game) => {
    const coordinates = coordinatesForGame(game, locations);
    const coordinateKey = coordinates
      ? `${coordinates.latitude},${coordinates.longitude}`
      : "";
    const forecast = coordinateKey ? forecastByCoordinate.get(coordinateKey) : null;
    const weather = forecast ? summarizeMatchWeather(game, forecast.hourly || {}) : null;
    const old = previousGames.get(game.id);
    const effectiveWeather = weather || old?.weather || null;
    const weatherApproximate = coordinates?.approximate === true;
    console.log(
      `Weather game ${game.date} ${game.kind}: ` +
      `${effectiveWeather ? "ready" : "missing"}; ` +
      `location=${coordinates?.source || "unresolved"}`,
    );
    return {
      ...game,
      locationQuery: undefined,
      coordinates: coordinates
        ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
        : null,
      weather: effectiveWeather,
      weatherApproximate,
      weatherStale: !weather && Boolean(old?.weather),
    };
  });

  const state = {
    schemaVersion: 1,
    startDate,
    endDate,
    updatedAt: nowIso,
    refreshHours: 6,
    providers: {
      weather: "Open-Meteo",
      geocoding: "OpenStreetMap Nominatim",
    },
    locations,
    games: enriched,
  };
  writeEncryptedIfChanged(STATE_PATH, state);
  console.log(
    `Refreshed 14-day weather for ${enriched.length} game(s) across ${forecastByCoordinate.size} venue(s).`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
