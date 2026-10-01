function parseDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

export function parseTime(value) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(
    String(value || "").trim(),
  );
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3]?.toUpperCase();

  if (suffix) {
    hour = (hour % 12) + (suffix === "PM" ? 12 : 0);
  }

  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function weekStart(date) {
  const parsed = parseDate(date);
  if (!parsed) return "";
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function isThursday(date) {
  const parsed = parseDate(date);
  return parsed?.getUTCDay() === 4;
}

function hasLocation(event) {
  return Boolean(
    String(event?.private?.fieldName || "").trim() ||
    String(event?.private?.address || "").trim(),
  );
}

function isDateSpecificallySnoozed(settings, date) {
  const until = Date.parse(settings?.snoozedDates?.[date] || "");
  return Number.isFinite(until) && until > Date.now();
}

function isMuted(settings, date) {
  return (settings?.mutedDates || []).includes(date);
}

function numericReserved(event) {
  const value = Number(event?.reserved);
  return Number.isFinite(value) ? value : 0;
}

function chooseCandidate(candidates) {
  const located = candidates
    .filter(hasLocation)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (located.length) {
    return { event: located[0], reason: "location" };
  }

  const ranked = [...candidates].sort((a, b) => {
    const countDiff = numericReserved(b) - numericReserved(a);
    if (countDiff !== 0) return countDiff;

    // Thursday is the preferred tie-breaker when vote counts are equal.
    const aThursday = isThursday(a.date);
    const bThursday = isThursday(b.date);
    if (aThursday !== bThursday) return aThursday ? -1 : 1;

    return a.date.localeCompare(b.date);
  });

  return { event: ranked[0] || null, reason: ranked.length ? "votes" : "none" };
}

export function selectPrimaryEvent({
  dates,
  loadEvent,
  nowDate,
  minuteOfDay = null,
  settings = {},
}) {
  const eligible = [];

  for (const date of [...dates].sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < nowDate) continue;

    const event = loadEvent(date);
    if (!event) continue;

    if (date === nowDate && minuteOfDay != null) {
      const end = parseTime(event.endTime);
      if (end != null && minuteOfDay >= end) continue;
    }

    eligible.push(event);
  }

  if (!eligible.length) {
    return { event: null, reason: "none", weekStart: "" };
  }

  const targetWeek = weekStart(eligible[0].date);
  const closestWeekEvents = eligible.filter(
    (event) => weekStart(event.date) === targetWeek,
  );

  const candidates = closestWeekEvents.filter(
    (event) =>
      !isMuted(settings, event.date) &&
      !isDateSpecificallySnoozed(settings, event.date),
  );

  if (candidates.length) {
    const chosen = chooseCandidate(candidates);
    return {
      ...chosen,
      weekStart: targetWeek,
      suppressed: false,
    };
  }

  // Do not jump to a later week if every date in the closest week is muted/snoozed.
  // Still return the best closest-week event so callers can refresh its baseline
  // without sending an alert, preventing old changes from replaying later.
  const fallback = chooseCandidate(closestWeekEvents);
  return {
    ...fallback,
    reason: "closest-week-suppressed",
    weekStart: targetWeek,
    suppressed: true,
  };
}
