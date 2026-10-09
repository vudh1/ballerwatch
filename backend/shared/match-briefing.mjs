/**
 * BallerWatch AI 8: transparent, deterministic weekly briefing.
 * Consumes only published match metadata and aggregate RSVP counts.
 * Never infers personal attendance, roster names, weather, or model predictions.
 */
function clean(value, max = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function weeklyMatchBriefing({ pickups = [], leagueGames = [], startDate, endDate } = {}) {
  const inRange = date => typeof date === "string" && date >= startDate && date <= endDate;
  const pickup = pickups
    .filter(game => inRange(game?.date))
    .map(game => {
      const reserved = game.reserved == null ? null : Number(game.reserved);
      const capacity = game.capacity == null ? null : Number(game.capacity);
      const known = Number.isSafeInteger(reserved) &&
        Number.isSafeInteger(capacity) && capacity > 0 && reserved >= 0;
      return {
        date:game.date, start:clean(game.start, 40),
        field:clean(game.field || game.location),
        reserved:known ? reserved : null,
        capacity:known ? capacity : null,
        remaining:known ? Math.max(0, capacity - reserved) : null,
        percent:known ? Math.round(reserved / capacity * 100) : null,
      };
    }).sort((a,b) => a.date.localeCompare(b.date));

  const league = leagueGames.filter(game => inRange(game?.date))
    .map(game => ({
      date:game.date, team:clean(game.team), opponent:clean(game.opponent),
      location:clean(game.location), time:clean(game.startTime || game.start, 60),
      jersey:clean(game.jerseyColor, 60),
    })).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 10);

  const lines = [`BallerWatch AI · ${startDate} through ${endDate}`];
  if (!league.length && !pickup.length) {
    return { reply: [...lines, "No published pickup or monitored RATS match is scheduled in this window."].join("\n") };
  }

  lines.push(`🏆 ${league.length} monitored league fixture${league.length === 1 ? "" : "s"}:`);
  lines.push(...(league.length ? league.map(game =>
    `• ${game.date} · ${game.team} vs ${game.opponent}${game.time ? ` · ${game.time}` : ""}${game.location ? ` · ${game.location}` : ""}${game.jersey ? ` · ${game.jersey} jersey` : ""}`)
    : ["• None published"]));

  lines.push(`⚽ ${pickup.length} RSVP pickup date${pickup.length === 1 ? "" : "s"}:`);
  lines.push(...(pickup.length ? pickup.map(game => {
    const status = game.capacity == null ? "capacity pending" :
      game.remaining === 0 ? "FULL" :
      `${game.reserved}/${game.capacity} booked (${game.percent}%, ${game.remaining} left)`;
    const urgency = game.capacity != null && game.remaining > 0 && game.percent >= 75
      ? " · Filling up" : "";
    return `• ${game.date} · ${status}${urgency}${game.field ? ` · ${game.field}` : ""}`;
  }) : ["• None published"]));

  lines.push("Based on published RATS fixtures and RSVP totals. No attendance or match-outcome predictions.");
  return { reply:lines.join("\n"), lastDate:pickup[0]?.date || league[0]?.date || "" };
}
