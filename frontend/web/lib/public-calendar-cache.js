/**
 * Small, strictly PUBLIC fixture snapshot for instantaneous repeat PWA launches.
 *
 * It is safe to persist because /web/calendar is anonymous public data. Never
 * write signed-in RSVP status, person names, push tokens or scouting histories.
 * Keep the allowlist tight when adding new calendar API fields.
 */
export const PUBLIC_CALENDAR_LOCAL_KEY = "ballerwatch-public-calendar-device-v1";
export const PUBLIC_CALENDAR_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_SERIALIZED_BYTES = 250_000;

const PUBLIC_GAME_FIELDS = Object.freeze([
  "id", "kind", "date", "dateLabel", "title", "team", "opponent",
  "startTime", "endTime", "time", "location", "address", "mapsQuery",
  "rsvpUrl", "locationUrl", "reserved", "capacity", "jerseyColor",
  "opponentJerseyColor", "bothMonitored",
  "sourceDate", "sourceStartTime", "sourceEndTime", "sourceLocation",
  "sourceAddress", "sourceMapsQuery", "overrideActive", "overrideUpdatedAt",
  "sourceUpdatedAt", "weatherApproximate", "weatherStale",
]);
const PUBLIC_WEATHER_FIELDS = Object.freeze([
  "weatherCode", "condition", "temperatureF", "rainProbability",
]);
const PUBLIC_COORDINATE_FIELDS = Object.freeze(["latitude", "longitude"]);

function selectFields(value, keys) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const key of keys) {
    const candidate = value[key];
    if (candidate === null || typeof candidate === "string" ||
        typeof candidate === "number" || typeof candidate === "boolean") {
      if (candidate !== undefined) result[key] = candidate;
    }
  }
  return result;
}

export function todaySeattleKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric",
    month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return [get("year"), get("month"), get("day")].join("-");
}

export function publicCalendarOnly(calendar) {
  if (!calendar || typeof calendar.startDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(calendar.startDate) ||
      !Array.isArray(calendar.games) || calendar.games.length > 350) return null;
  const games = [];
  for (const entry of calendar.games) {
    if (!entry || typeof entry !== "object" ||
        typeof entry.id !== "string" || typeof entry.date !== "string") return null;
    const game = selectFields(entry, PUBLIC_GAME_FIELDS);
    if (entry.weather) {
      game.weather = selectFields(entry.weather, PUBLIC_WEATHER_FIELDS);
    }
    for (const key of ["coordinates", "venueCoordinates"]) {
      if (entry[key]) game[key] = selectFields(entry[key], PUBLIC_COORDINATE_FIELDS);
    }
    games.push(game);
  }
  return {
    startDate: calendar.startDate,
    endDate: typeof calendar.endDate === "string" ? calendar.endDate : "",
    updatedAt: typeof calendar.updatedAt === "string" ? calendar.updatedAt : "",
    refreshHours: Number.isFinite(calendar.refreshHours) ? calendar.refreshHours : 6,
    providers: selectFields(calendar.providers, ["weather", "geocoding"]),
    games,
  };
}

export function writePublicCalendar(storage, key, calendar, now = Date.now()) {
  try {
    const safe = publicCalendarOnly(calendar);
    if (!safe) return false;
    const text = JSON.stringify({ at: now, calendar: safe });
    if (text.length > MAX_SERIALIZED_BYTES) return false;
    storage.setItem(key, text);
    return true;
  } catch {
    // Storage may be restricted by private browsing or OS quota.
    return false;
  }
}

export function readPublicCalendar(storage, key, now = Date.now(),
  today = todaySeattleKey(new Date(now))) {
  try {
    const text = storage.getItem(key);
    if (!text || text.length > MAX_SERIALIZED_BYTES) return null;
    const saved = JSON.parse(text);
    if (!Number.isFinite(saved?.at) || saved.at > now + 60_000 ||
        now - saved.at > PUBLIC_CALENDAR_MAX_AGE_MS) return null;
    const calendar = publicCalendarOnly(saved.calendar);
    // A past-day schedule is not safe to present as today's calendar.
    if (!calendar || calendar.startDate !== today) return null;
    return calendar;
  } catch {
    return null;
  }
}
