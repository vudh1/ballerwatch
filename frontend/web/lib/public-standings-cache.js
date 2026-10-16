/**
 * Anonymous, strictly allow-listed PUBLIC RATS standings and fixture odds.
 * Read synchronously before any network call so returning visitors see the
 * standings card and match projections alongside their saved calendar.
 * No scouting-report histories, credentials, RSVP users or settings are stored.
 */
import { todaySeattleKey } from "./public-calendar-cache.js";

export const PUBLIC_STANDINGS_LOCAL_KEY = typeof window !== "undefined" &&
  /^\/ballerwatch\/beta(?:\/|$)/.test(window.location?.pathname || "")
  ? "ballerwatch-beta-public-standings-device-v1" : "ballerwatch-public-standings-device-v1";
export const PUBLIC_STANDINGS_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_BYTES = 250_000;
const CARD_FIELDS = ["team", "division", "divisionKey", "ready", "hasResults", "message"];
const ROW_FIELDS = ["name", "rank", "highlighted", "played", "wins", "draws",
  "losses", "goalDifference", "goalsFor", "goalsAgainst", "points"];
const MATCHUP_FIELDS = ["team", "opponent", "winPct", "drawPct", "lossPct",
  "teamGames", "opponentGames", "headToHeadGames", "sampleLimited", "method"];
const RECENT_FIELDS = ["team", "games", "wins", "weightedWinPct", "formWindow"];

function selectFields(source, fields) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const result = {};
  for (const key of fields) {
    const value = source[key];
    if (typeof value === "string" && value.length <= 240 ||
        typeof value === "number" && Number.isFinite(value) ||
        typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

export function publicStandingsOnly(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.cards) ||
      data.cards.length > 35 || !data.cards.every((c) =>
        c && typeof c.team === "string" && c.team.length <= 120 &&
        Array.isArray(c.rows) && c.rows.length <= 100)) return null;
  const cards = data.cards.map((card) => ({
    ...selectFields(card, CARD_FIELDS),
    rows: card.rows.map((row) => selectFields(row, ROW_FIELDS)),
    ...(card.recentForm ? { recentForm: selectFields(card.recentForm, RECENT_FIELDS) } : {}),
  }));
  const matchups = {};
  const entries = Object.entries(data.matchups || {});
  if (entries.length > 96) return null;
  for (const [key, value] of entries) {
    if (key.length > 245 || !value || typeof value !== "object") return null;
    matchups[key] = selectFields(value, MATCHUP_FIELDS);
  }
  return {
    ...selectFields(data, ["season", "seasonId", "updatedAt", "source", "method", "official"]),
    cards, matchups,
  };
}

export function writePublicStandings(storage, key, standings, now = Date.now(),
  today = todaySeattleKey(new Date(now))) {
  try {
    const safe = publicStandingsOnly(standings);
    if (!safe) return false;
    const text = JSON.stringify({ at: now, today, standings: safe });
    if (text.length > MAX_BYTES) return false;
    storage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

export function readPublicStandings(storage, key, now = Date.now(),
  today = todaySeattleKey(new Date(now))) {
  try {
    const text = storage.getItem(key);
    if (!text || text.length > MAX_BYTES) return null;
    const saved = JSON.parse(text);
    if (!Number.isFinite(saved?.at) || saved.at > now + 60_000 ||
        now - saved.at > PUBLIC_STANDINGS_MAX_AGE_MS ||
        saved.today !== today) return null;
    return publicStandingsOnly(saved.standings);
  } catch {
    return null;
  }
}
