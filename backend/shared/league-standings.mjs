/**
 * Derives public, results-based standings for each monitored RATS division.
 *
 * Uses the already-encrypted RATS season archive after decryption at the edge.
 * No user or private roster data enters the public standings payload.
 * Added in v8.2.0.
 */
import { completedHistoryMatches, historyTeamKey, normalizeHistoryTeamName } from "./rats-history.mjs";

const SEASON_NAMES = ["winter", "spring", "summer", "fall"];

function seasonLabel(seasonId) {
  const match = /^(winter|spring|summer|fall)-(\d{4})$/i.exec(String(seasonId || ""));
  return match ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}` : "";
}

function normalizedDivision(team) {
  return [team?.day, team?.gender, team?.division]
    .map((part) => String(part || "").trim().toLowerCase())
    .join("|");
}

function displayDivision(team) {
  return [team?.day, team?.gender, team?.division ? `D-${team.division}` : ""]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function seasonData(history, seasonId) {
  return (Array.isArray(history?.seasons) ? history.seasons : [])
    .find((season) => season.seasonId === seasonId) || null;
}

function matchingTeam(teams, name) {
  const exact = teams.filter((team) =>
    normalizeHistoryTeamName(team?.name) === normalizeHistoryTeamName(name));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const alias = teams.filter((team) => historyTeamKey(team?.name) === historyTeamKey(name));
  return alias.length === 1 ? alias[0] : null;
}

function resultScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

function divisionStandings(season, trackedTeam, today) {
  const division = normalizedDivision(trackedTeam);
  const members = season.teams.filter((team) => normalizedDivision(team) === division);
  const unique = new Map();
  for (const team of members) {
    const key = normalizeHistoryTeamName(team.name);
    if (!key || unique.has(key)) continue;
    unique.set(key, {
      name: team.name, played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    });
  }

  const matches = Array.isArray(season.matches) ? season.matches : [];
  for (const match of matches) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(match?.date || "")) ||
        match.date > today) continue;
    const homeScore = resultScore(match.homeScore);
    const awayScore = resultScore(match.awayScore);
    if (homeScore === null || awayScore === null) continue;
    const home = unique.get(normalizeHistoryTeamName(match.homeTeam));
    const away = unique.get(normalizeHistoryTeamName(match.awayTeam));
    // Never count interdivision, unknown, or ambiguous results in a division.
    if (!home || !away || home === away) continue;
    for (const [row, scored, conceded] of [
      [home, homeScore, awayScore], [away, awayScore, homeScore],
    ]) {
      row.played += 1;
      row.goalsFor += scored;
      row.goalsAgainst += conceded;
      row.goalDifference += scored - conceded;
      if (scored > conceded) { row.wins += 1; row.points += 3; }
      else if (scored === conceded) { row.draws += 1; row.points += 1; }
      else row.losses += 1;
    }
  }

  const rows = [...unique.values()].sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function previousSeasonId(seasonId) {
  const match = /^(winter|spring|summer|fall)-(\d{4})$/i.exec(String(seasonId || ""));
  if (!match) return "";
  const index = SEASON_NAMES.indexOf(match[1].toLowerCase());
  const previousIndex = (index + SEASON_NAMES.length - 1) % SEASON_NAMES.length;
  const year = Number(match[2]) - (index === 0 ? 1 : 0);
  return `${SEASON_NAMES[previousIndex]}-${year}`;
}

function rankedGoalRate(rows, teamName, field, ascending = false) {
  const scored = rows.filter((row) => row.played > 0);
  if (!scored.length) return null;
  const ordered = [...scored].sort((a, b) => {
    const left = a[field] / a.played;
    const right = b[field] / b.played;
    return (ascending ? left - right : right - left) ||
      a.name.localeCompare(b.name);
  });
  const chosen = ordered.find((row) =>
    normalizeHistoryTeamName(row.name) === normalizeHistoryTeamName(teamName));
  if (!chosen) return null;
  // Ties share ranks: alphabetical sorting only stabilizes display order.
  const rate = chosen[field] / chosen.played;
  const better = ordered.filter((row) => {
    const comparison = row[field] / row.played;
    return ascending ? comparison < rate : comparison > rate;
  }).length;
  return {
    rank: better + 1,
    total: scored.length,
    perGame: Math.round(rate * 100) / 100,
    goals: chosen[field],
  };
}

function trackedTeamStats(history, seasonId, team, rows, today) {
  const attack = rankedGoalRate(rows, team.name, "goalsFor");
  const defense = rankedGoalRate(rows, team.name, "goalsAgainst", true);
  const priorId = previousSeasonId(seasonId);
  const prior = seasonData(history, priorId);
  const previousTeam = matchingTeam(
    Array.isArray(prior?.teams) ? prior.teams : [],
    team.name,
  );
  let previousSeason = null;
  if (prior && previousTeam) {
    const previousRows = divisionStandings(prior, previousTeam, today);
    const matched = previousRows.find((row) =>
      normalizeHistoryTeamName(row.name) === normalizeHistoryTeamName(previousTeam.name));
    if (matched && matched.played > 0) {
      previousSeason = {
        rank: matched.rank,
        total: previousRows.length,
        label: prior.label || seasonLabel(priorId),
        division: displayDivision(previousTeam),
        matches: matched.played,
      };
    }
  }

  return {
    attack,
    defense,
    previousSeason,
    previousSeasonLabel: seasonLabel(priorId),
    archiveComplete: history?.coverage?.complete === true,
  };
}

/** Current-season cards deliberately never fall back to a previous season. */
export function buildLeagueStandings(history, seasonId, monitoredTeams = [], today = "9999-12-31") {
  const season = seasonData(history, seasonId);
  const teams = Array.isArray(season?.teams) ? season.teams : [];
  const tracked = [...new Set(
    (Array.isArray(monitoredTeams) ? monitoredTeams : [])
      .map((team) => String(team || "").trim()).filter(Boolean),
  )];
  const cache = new Map();

  return {
    seasonId,
    season: season?.label || seasonLabel(seasonId),
    updatedAt: String(history?.updatedAt || ""),
    source: "RATS public results archive",
    method: "Calculated: 3 points per win, 1 per draw; ranked by points, goal difference, goals for",
    official: false,
    cards: tracked.map((name) => {
      const team = matchingTeam(teams, name);
      if (!team) {
        return { team: name, division: "", ready: false, rows: [], message:
          season ? "Team not found in the current season standings." :
            "Current season results have not been indexed yet." };
      }
      const key = normalizedDivision(team);
      if (!cache.has(key)) cache.set(key, divisionStandings(season, team, today));
      const rows = cache.get(key);
      const highlightedName = normalizeHistoryTeamName(team.name);
      return {
        team: team.name,
        division: displayDivision(team),
        ready: true,
        rows: rows.map((row) => ({
          ...row,
          highlighted: normalizeHistoryTeamName(row.name) === highlightedName,
        })),
        hasResults: rows.some((row) => row.played > 0),
        stats: trackedTeamStats(history, seasonId, team, rows, today),
      };
    }),
  };
}

/** Returns only completed public games; no score means the game is omitted. */
export function buildLeagueTeamHistory(history, currentSeasonId, teamName, limit = 35, today = "9999-12-31") {
  const current = seasonData(history, currentSeasonId);
  const team = matchingTeam(Array.isArray(current?.teams) ? current.teams : [], teamName);
  if (!team) return null;
  const target = historyTeamKey(team.name);
  const matches = completedHistoryMatches(history)
    .filter((match) => {
      if (historyTeamKey(match.homeTeam) !== target &&
          historyTeamKey(match.awayTeam) !== target) return false;
      return /^\d{4}-\d{2}-\d{2}$/.test(String(match.date || "")) &&
        match.date <= today &&
        resultScore(match.homeScore) !== null &&
        resultScore(match.awayScore) !== null;
    })
    .sort((a, b) => b.date.localeCompare(a.date) ||
      b.seasonId.localeCompare(a.seasonId) ||
      String(b.startTime || "").localeCompare(String(a.startTime || "")));

  return {
    team: team.name,
    indexedMatchCount: matches.length,
    coverageComplete: history?.coverage?.complete === true,
    updatedAt: String(history?.updatedAt || ""),
    matches: matches.slice(0, Math.min(50, Math.max(1, limit))).map((match) => {
      const isHome = historyTeamKey(match.homeTeam) === target;
      const scored = isHome ? match.homeScore : match.awayScore;
      const conceded = isHome ? match.awayScore : match.homeScore;
      return {
        season: match.season,
        date: match.date,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        result: scored > conceded ? "W" : scored < conceded ? "L" : "D",
      };
    }),
  };
}
