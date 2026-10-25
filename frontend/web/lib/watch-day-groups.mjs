/**
 * Pure watch-day grouping. Same-day fixtures share one compact day card,
 * with one entry per unique published match and UTC kickoff ordering.
 */
export function watchedDayGroups(games, fromDate, days = 14) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate || "")) return [];
  const from = Date.parse(fromDate + "T12:00:00Z");
  const toDate = new Date(from + (Math.max(1, Math.min(366, days)) - 1) * 86400000)
    .toISOString().slice(0, 10);
  const dates = new Map();
  const seen = new Set();
  for (const game of Array.isArray(games) ? games : []) {
    if (!game || game.kind !== "watch" || typeof game.id !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(game.date || "") ||
        game.date < fromDate || game.date > toDate || seen.has(game.id)) continue;
    seen.add(game.id);
    if (!dates.has(game.date)) dates.set(game.date, []);
    dates.get(game.date).push(game);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, matches]) => ({
      date, matches: matches.sort((a, b) =>
        String(a.startUtc || "").localeCompare(String(b.startUtc || "")) ||
        a.id.localeCompare(b.id)),
    }));
}

/** One icon per sport present on a watched date, independent of match count. */
export function watchedDaySportIcons(games) {
  const sports = new Set((Array.isArray(games) ? games : [])
    .filter(game => game?.kind === "watch").map(game => game.sport));
  return [sports.has("soccer") || sports.has("football") ? "⚽" : "",
    sports.has("basketball") ? "🏀" : ""].filter(Boolean);
}
