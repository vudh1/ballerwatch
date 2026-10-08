/**
 * Deterministic RATS historical-stat queries for the BallerWatch bot.
 *
 * Input is a public-results archive built from Seattle RATS season aggregates.
 * The module never performs network I/O and contains no user/private runtime data.
 * Added in v7.1.0.
 */

const SEASON_NAMES = ["winter", "spring", "summer", "fall"];

export function normalizeHistoryTeamName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function seasonSortKey(seasonId) {
  const match = String(seasonId || "").match(/^(winter|spring|summer|fall)-(\d{4})$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) * 10 + SEASON_NAMES.indexOf(match[1].toLowerCase());
}

function seasonLabel(seasonId) {
  const match = String(seasonId || "").match(/^(winter|spring|summer|fall)-(\d{4})$/i);
  if (!match) return String(seasonId || "");
  return `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`;
}

export function historySeasonFromQuestion(question) {
  const match = String(question || "").match(/\b(winter|spring|summer|fall)[\s-]+((?:19|20)\d{2})\b/i);
  return match ? `${match[1].toLowerCase()}-${match[2]}` : "";
}

export function historyTeamNames(history) {
  const names = new Map();
  for (const season of Array.isArray(history?.seasons) ? history.seasons : []) {
    for (const team of Array.isArray(season?.teams) ? season.teams : []) {
      const name = String(team?.name || "").trim();
      const normalized = normalizeHistoryTeamName(name);
      if (normalized && !names.has(normalized)) names.set(normalized, name);
    }
    for (const match of Array.isArray(season?.matches) ? season.matches : []) {
      for (const value of [match?.homeTeam, match?.awayTeam]) {
        const name = String(value || "").trim();
        const normalized = normalizeHistoryTeamName(name);
        if (normalized && !names.has(normalized)) names.set(normalized, name);
      }
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function normalizedQuestion(question) {
  return ` ${normalizeHistoryTeamName(question)} `;
}

export function historyTeamsInQuestion(question, history, contextTeams = []) {
  const names = historyTeamNames(history)
    .map((name) => ({ name, normalized: normalizeHistoryTeamName(name) }))
    .filter((item) => item.normalized)
    .sort((a, b) => b.normalized.length - a.normalized.length);

  const input = normalizedQuestion(question);
  const matched = [];
  const matchedNormalized = new Set();
  for (const item of names) {
    if (!input.includes(` ${item.normalized} `)) continue;
    if ([...matchedNormalized].some((value) =>
      value.includes(item.normalized) || item.normalized.includes(value))) {
      continue;
    }
    matched.push(item.name);
    matchedNormalized.add(item.normalized);
  }

  if (matched.length) return matched.slice(0, 2);

  const available = new Map(names.map((item) => [item.normalized, item.name]));
  return (Array.isArray(contextTeams) ? contextTeams : [])
    .map((name) => available.get(normalizeHistoryTeamName(name)))
    .filter(Boolean)
    .slice(0, 2);
}

function seasonMatches(history, seasonId = "") {
  const seasons = Array.isArray(history?.seasons) ? history.seasons : [];
  return seasons
    .filter((season) => !seasonId || season?.seasonId === seasonId)
    .sort((a, b) => seasonSortKey(a?.seasonId) - seasonSortKey(b?.seasonId));
}

function numericScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function completedHistoryMatches(history, seasonId = "") {
  const matches = [];
  for (const season of seasonMatches(history, seasonId)) {
    for (const match of Array.isArray(season?.matches) ? season.matches : []) {
      const homeScore = numericScore(match?.homeScore);
      const awayScore = numericScore(match?.awayScore);
      if (homeScore === null || awayScore === null) continue;
      matches.push({
        ...match,
        seasonId: season.seasonId,
        season: season.label || seasonLabel(season.seasonId),
        homeScore,
        awayScore,
      });
    }
  }
  return matches;
}

function teamSide(match, teamName) {
  const target = normalizeHistoryTeamName(teamName);
  if (normalizeHistoryTeamName(match?.homeTeam) === target) return "home";
  if (normalizeHistoryTeamName(match?.awayTeam) === target) return "away";
  return "";
}

export function historyRecord(history, teamName, seasonId = "") {
  const record = {
    team: teamName,
    seasonId,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    seasons: new Set(),
  };

  for (const match of completedHistoryMatches(history, seasonId)) {
    const side = teamSide(match, teamName);
    if (!side) continue;
    const goalsFor = side === "home" ? match.homeScore : match.awayScore;
    const goalsAgainst = side === "home" ? match.awayScore : match.homeScore;
    record.games += 1;
    record.goalsFor += goalsFor;
    record.goalsAgainst += goalsAgainst;
    record.seasons.add(match.seasonId);
    if (goalsFor > goalsAgainst) record.wins += 1;
    else if (goalsFor < goalsAgainst) record.losses += 1;
    else record.draws += 1;
  }

  return { ...record, seasons: [...record.seasons].sort() };
}

export function historyHeadToHead(history, teamA, teamB, seasonId = "") {
  const a = normalizeHistoryTeamName(teamA);
  const b = normalizeHistoryTeamName(teamB);
  const matches = completedHistoryMatches(history, seasonId)
    .filter((match) => {
      const home = normalizeHistoryTeamName(match.homeTeam);
      const away = normalizeHistoryTeamName(match.awayTeam);
      return (home === a && away === b) || (home === b && away === a);
    })
    .sort((left, right) =>
      String(left.date || "").localeCompare(String(right.date || "")) ||
      seasonSortKey(left.seasonId) - seasonSortKey(right.seasonId));

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  for (const match of matches) {
    const side = teamSide(match, teamA);
    const scoreA = side === "home" ? match.homeScore : match.awayScore;
    const scoreB = side === "home" ? match.awayScore : match.homeScore;
    if (scoreA > scoreB) winsA += 1;
    else if (scoreA < scoreB) winsB += 1;
    else draws += 1;
  }
  return { teamA, teamB, matches, winsA, winsB, draws };
}

function teamSeasonLabels(history, teamName) {
  const target = normalizeHistoryTeamName(teamName);
  const labels = [];
  for (const season of seasonMatches(history)) {
    const appears = (season?.teams || []).some((team) =>
      normalizeHistoryTeamName(team?.name) === target) ||
      (season?.matches || []).some((match) =>
        normalizeHistoryTeamName(match?.homeTeam) === target ||
        normalizeHistoryTeamName(match?.awayTeam) === target);
    if (appears) labels.push(season.label || seasonLabel(season.seasonId));
  }
  return labels;
}

function formatRecord(record) {
  return `${record.wins}-${record.draws}-${record.losses} (W-D-L)`;
}

function historyCoverageLabel(history) {
  const count = Number(history?.coverage?.seasonCount || 0);
  const first = String(history?.coverage?.firstSeason || "");
  const last = String(history?.coverage?.lastSeason || "");
  if (count > 0 && first && last) {
    const range = first === last
      ? seasonLabel(first)
      : `${seasonLabel(first)} through ${seasonLabel(last)}`;
    return `${count} indexed RATS season${count === 1 ? "" : "s"} (${range})`;
  }
  return "indexed RATS history";
}

function formatMatch(match) {
  const date = String(match?.date || "");
  return `${match.season} · ${date}: ${match.homeTeam} ${match.homeScore}–${match.awayScore} ${match.awayTeam}`;
}

function suggestions(question, history) {
  const inputTokens = new Set(normalizeHistoryTeamName(question).split(" ").filter((token) => token.length >= 3));
  return historyTeamNames(history)
    .map((name) => {
      const tokens = normalizeHistoryTeamName(name).split(" ");
      const score = tokens.filter((token) => inputTokens.has(token)).length;
      return { name, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((item) => item.name);
}

export function answerRatsHistoryQuestion(question, history, contextTeams = []) {
  if (!history || !Array.isArray(history.seasons) || !history.seasons.length) {
    return {
      reply: "RATS historical results are not available yet.",
      teams: [],
    };
  }

  const seasonId = historySeasonFromQuestion(question);
  if (seasonId && !history.seasons.some((season) => season?.seasonId === seasonId)) {
    return {
      reply: `I don't have ${seasonLabel(seasonId)} in the RATS history index.`,
      teams: [],
    };
  }

  const teams = historyTeamsInQuestion(question, history, contextTeams);
  if (!teams.length) {
    const near = suggestions(question, history);
    return {
      reply: near.length
        ? `I couldn't match a RATS team name exactly. Possible teams:\n${near.map((name) => `• ${name}`).join("\n")}`
        : "I couldn't match a RATS team name in the historical index.",
      teams: [],
    };
  }

  const scope = seasonId ? seasonLabel(seasonId) : historyCoverageLabel(history);
  if (teams.length >= 2) {
    const h2h = historyHeadToHead(history, teams[0], teams[1], seasonId);
    if (!h2h.matches.length) {
      return {
        reply: `I found no completed scored meeting between ${teams[0]} and ${teams[1]} in ${scope}.`,
        teams: teams.slice(0, 2),
      };
    }
    const recent = h2h.matches.slice(-5).reverse();
    return {
      reply: [
        `${teams[0]} vs ${teams[1]} — ${scope}`,
        `${h2h.matches.length} meeting${h2h.matches.length === 1 ? "" : "s"} · ${teams[0]} ${h2h.winsA}W · ${h2h.draws}D · ${teams[1]} ${h2h.winsB}W`,
        ...recent.map((match) => `• ${formatMatch(match)}`),
      ].join("\n"),
      teams: teams.slice(0, 2),
    };
  }

  const team = teams[0];
  const lower = String(question || "").toLowerCase();
  if (/\b(which|what) seasons?\b|\bseason history\b/.test(lower)) {
    const labels = teamSeasonLabels(history, team);
    return {
      reply: labels.length
        ? `${team} appears in ${labels.length} indexed RATS season${labels.length === 1 ? "" : "s"}:\n${labels.map((label) => `• ${label}`).join("\n")}`
        : `I found no indexed RATS seasons for ${team}.`,
      teams: [team],
    };
  }

  const record = historyRecord(history, team, seasonId);
  if (!record.games) {
    return {
      reply: `I found ${team} in the RATS history index, but no completed scored matches in ${scope}. The archive may still contain unscored or future events.`,
      teams: [team],
    };
  }
  const seasonCount = seasonId ? 1 : record.seasons.length;
  return {
    reply: [
      `${team} — ${scope}`,
      `Record: ${formatRecord(record)} across ${record.games} scored match${record.games === 1 ? "" : "es"}`,
      `Goals: ${record.goalsFor} for, ${record.goalsAgainst} against · ${seasonCount} season${seasonCount === 1 ? "" : "s"} with scored results`,
    ].join("\n"),
    teams: [team],
  };
}
