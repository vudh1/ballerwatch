/**
 * Public, read-only RFC 5545 event projection. Never include private RSVP
 * rosters, user settings, notification state or credentials.
 */
const PACIFIC = "America/Los_Angeles";
const clock = value => {
  const found = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\:\d{2})?\s*(AM|PM)?$/i);
  if (!found) return null;
  let hours = Number(found[1]);
  const minutes = Number(found[2]);
  if (minutes > 59 || hours > (found[3] ? 12 : 23) || (found[3] && hours < 1)) return null;
  if (found[3]) hours = (hours % 12) + (/PM/i.test(found[3]) ? 12 : 0);
  return { hours, minutes };
};
const stamp = time => new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icalEscape = text => String(text ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n")
  .replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/[\r\n]/g, " ");
const dayStamp = date => String(date).replace(/-/g, "");
const dayAfter = day => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
function zonedUtc(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, time.hours, time.minutes);
  let instant = wanted + 8 * 3600000;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const seen = Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day),
      Number(parts.hour), Number(parts.minute));
    const diff = wanted - seen;
    if (!diff) break;
    instant += diff;
  }
  return stamp(instant);
}
function bounds(game) {
  if (game.startUtc && !Number.isNaN(Date.parse(game.startUtc))) {
    const start = Date.parse(game.startUtc);
    const end = game.endUtc && !Number.isNaN(Date.parse(game.endUtc))
      ? Date.parse(game.endUtc) : start + (game.sport === "basketball" ? 3 : 2) * 3600000;
    return [`DTSTART:${stamp(start)}`, `DTEND:${stamp(Math.max(start + 60_000, end))}`];
  }
  const date = String(game.date || "");
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00Z"))) return null;
  const start = clock(game.startTime);
  if (!start) return [`DTSTART;VALUE=DATE:${dayStamp(date)}`,
    `DTEND;VALUE=DATE:${dayStamp(dayAfter(date))}`];
  const endClock = clock(game.endTime);
  const startsAt = zonedUtc(date, start);
  let endAt;
  if (endClock) {
    const endDate = endClock.hours * 60 + endClock.minutes <= start.hours * 60 + start.minutes
      ? dayAfter(date) : date;
    endAt = zonedUtc(endDate, endClock);
  } else {
    endAt = stamp(Date.parse(startsAt.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, "$1-$2-$3T$4:$5:$6Z")) + 2 * 3600000);
  }
  return [`DTSTART:${startsAt}`, `DTEND:${endAt}`];
}
function fold(line) {
  let out = "", n = 0;
  for (const c of line) {
    const size = new TextEncoder().encode(c).length;
    if (n + size > 75) { out += "\r\n "; n = 1; }
    out += c; n += size;
  }
  return out;
}
export function calendarToIcs(games = [], { name = "BallerWatch", updatedAt = "" } = {}) {
  const generated = !Number.isNaN(Date.parse(updatedAt)) && updatedAt
    ? stamp(Date.parse(updatedAt)) : stamp(Date.now());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BallerWatch//Read Only Fixtures//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + icalEscape(name),
    "X-WR-TIMEZONE:" + PACIFIC,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ];
  const seen = new Set();
  for (const game of games.slice(0, 700)) {
    if (!game || !game.id || seen.has(game.id)) continue;
    const times = bounds(game);
    if (!times) continue;
    seen.add(game.id);
    const uid = encodeURIComponent(String(game.id).slice(0, 250)) + "@ballerwatch";
    const title = String(game.title || [game.team, game.opponent].filter(Boolean).join(" vs ") || "Match");
    const summary = game.kind === "watch" && game.competition
      ? game.competition + " · " + title : title;
    const description = [game.kind === "watch" ? "Watching · professional sports" : "Playing · BallerWatch",
      game.competition ? (game.kind === "watch" ? "Competition: " : "") + game.competition : "", game.jerseyColor ? "Jersey: " + game.jerseyColor : "",
      game.opponentJerseyColor ? "Opponent jersey: " + game.opponentJerseyColor : "",
      game.kind === "watch" && Array.isArray(game.broadcasts) && game.broadcasts.length
        ? "US TV: " + game.broadcasts.slice(0, 2).join(", ") : "",
      game.rsvpUrl || "", game.locationUrl || "", game.url || ""].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + generated,
      ...times, "SUMMARY:" + icalEscape(summary),
      "DESCRIPTION:" + icalEscape(description));
    if (game.location || game.address) lines.push("LOCATION:" + icalEscape(game.address || game.location));
    if (game.cancelled) lines.push("STATUS:CANCELLED");
    const sourceAt = Date.parse(game.sourceUpdatedAt || updatedAt);
    if (Number.isFinite(sourceAt)) lines.push("LAST-MODIFIED:" + stamp(sourceAt));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
