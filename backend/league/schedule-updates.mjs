/**
 * Compares verified RATS schedules for independent Web Push change alerts.
 * Does not use external calendar accounts, credentials or mutable user data.
 */
import { dateInZone, TZ } from "./rats-utils.mjs";

const NOTICE_FIELDS = Object.freeze([
  "team", "opponent", "homeAway", "date", "startTime", "endTime",
  "start", "end", "location", "fieldNotes", "jerseyColor",
  "opponentJerseyColor", "division", "season", "mapUrl", "eventType",
]);

export function materialFixtureChanged(previous, current) {
  return NOTICE_FIELDS.some((field) =>
    (previous?.[field] ?? null) !== (current?.[field] ?? null));
}

function isUpcoming(match, now) {
  if (!match?.date || match.date < dateInZone(now, TZ)) return false;
  const end = Date.parse(match.end || match.start || "");
  return !Number.isFinite(end) || end > now.getTime();
}

export function scheduleNotificationUpdates(previous, current, now = new Date()) {
  // Initial hydration or a new season must not replay an entire schedule as news.
  if (!previous?.ok || !Array.isArray(previous.teams) ||
      previous.seasonId !== current?.seasonId) return [];
  const before = new Map(previous.teams.flatMap((team) =>
    (team.matches || []).map((match) => [match.key, match])));
  const seen = new Set();
  const updates = [];
  for (const team of current?.teams || []) {
    for (const match of team.matches || []) {
      if (!match?.key || seen.has(match.key) || !isUpcoming(match, now)) continue;
      seen.add(match.key); // One notice even when both monitored teams play.
      const prior = before.get(match.key);
      if (!prior || materialFixtureChanged(prior, match)) {
        updates.push({ action: prior ? "updated" : "created", match });
      }
    }
  }
  return updates;
}
