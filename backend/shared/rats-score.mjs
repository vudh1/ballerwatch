/**
 * Normalizes public RATS score fields shared by the watcher, history index, and edge adapter.
 *
 * RATS aggregate events publish final scores as compact strings such as "3-1".
 * Some source revisions may expose explicit or nested score fields instead, so this parser
 * keeps all supported forms deterministic and fails closed on ambiguous score text.
 */

function numericScore(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function ratsScorePair(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const home = numericScore(value[0]);
    const away = numericScore(value[1]);
    return home === null || away === null ? null : [home, away];
  }

  if (typeof value === "string") {
    const match = value.trim().match(/^(\d+)\s*[-–—:]\s*(\d+)$/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2])];
  }

  if (value && typeof value === "object") {
    const home = numericScore(
      value.home ?? value.home_score ?? value.homeScore ?? value.home_goals ?? value.homeGoals,
    );
    const away = numericScore(
      value.away ?? value.away_score ?? value.awayScore ?? value.away_goals ?? value.awayGoals,
    );
    return home === null || away === null ? null : [home, away];
  }

  return null;
}

export function ratsEventScore(event, side) {
  if (!event || typeof event !== "object" || !["home", "away"].includes(side)) return null;

  const explicit = [
    `${side}_score`,
    `${side}Score`,
    `${side}_goals`,
    `${side}Goals`,
    `score_${side}`,
    `goals_${side}`,
  ];
  for (const key of explicit) {
    const score = numericScore(event[key]);
    if (score !== null) return score;
  }

  const pair = ratsScorePair(event.score);
  if (pair) return side === "home" ? pair[0] : pair[1];

  const nested = event.score;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const key of [side, `${side}_score`, `${side}Score`]) {
      const score = numericScore(nested[key]);
      if (score !== null) return score;
    }
  }

  for (const [key, value] of Object.entries(event)) {
    const normalized = String(key).toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
    if (
      normalized.includes(side) &&
      (normalized.includes("score") || normalized.includes("goal"))
    ) {
      const score = numericScore(value);
      if (score !== null) return score;
    }
  }
  return null;
}
