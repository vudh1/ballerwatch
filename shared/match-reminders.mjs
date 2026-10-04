/**
 * Shared deterministic reminder windows for scheduled soccer matches.
 *
 * Callers provide local pickup clock values or absolute league start times.
 * Policy is intentionally generic/public-safe: it never decides user-specific
 * RSVP status.
 */

export const RSVP_REMINDER_MINUTES = 24 * 60;
export const MATCH_START_REMINDER_MINUTES = 60;

function dayNumber(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

export function localMinutesUntilStart({
  matchDate,
  startMinute,
  nowDate,
  nowMinute,
} = {}) {
  const matchDay = dayNumber(matchDate);
  const currentDay = dayNumber(nowDate);
  const start = Number(startMinute);
  const current = Number(nowMinute);
  if (
    matchDay == null ||
    currentDay == null ||
    !Number.isFinite(start) ||
    !Number.isFinite(current)
  ) {
    return null;
  }
  return (matchDay - currentDay) * 24 * 60 + start - current;
}

export function rsvpReminderDue(minutesUntilStart) {
  return (
    Number.isFinite(minutesUntilStart) &&
    minutesUntilStart > MATCH_START_REMINDER_MINUTES &&
    minutesUntilStart <= RSVP_REMINDER_MINUTES
  );
}

export function matchStartReminderDue(minutesUntilStart) {
  return (
    Number.isFinite(minutesUntilStart) &&
    minutesUntilStart > 0 &&
    minutesUntilStart <= MATCH_START_REMINDER_MINUTES
  );
}

export function absoluteMinutesUntilStart(start, now = new Date()) {
  const startMs = Date.parse(String(start || ""));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return null;
  return (startMs - nowMs) / 60_000;
}
