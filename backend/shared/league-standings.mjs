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
  // Two similarly named divisions can have different 8v8/11v11 rosters.
  // Preserve the old grouping for unlabelled/11v11 teams, but never merge a
  // clearly identified 8v8 division into the corresponding 11v11 results.
  const label = [team?.leagueName, team?.day, team?.gender, team?.divisionLabel]
    .map((part) => String(part || "")).join(" ");
  const format = /\b8\s*(?:v|vs|x|on)\s*8\b/i.test(label) ? "8v8" : "11v11";
  return [team?.day, team?.gender, team?.division, format]
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
      };
    }),
  };
}

/** Detects the *published* league format. Old archives without league names remain unknown. */
function leagueFormat(team) {
  if (!team) return "unknown";
  const leagueName = String(team.leagueName || "").trim();
  const alternative = [team.day, team.gender, team.division, team.divisionLabel]
    .map((value) => String(value || "")).join(" ");
  const label = leagueName || alternative;
  if (/\b8\s*(?:v|vs|x|on)\s*8\b/i.test(label)) return "8v8";
  if (leagueName || /\b11\s*(?:v|vs|x|on)\s*11\b/i.test(alternative)) return "11v11";
  return "unknown";
}

function scoredDivisionMatches(season, team, today) {
  const members = new Set((season?.teams || [])
    .filter((member) => normalizedDivision(member) === normalizedDivision(team))
    .map((member) => normalizeHistoryTeamName(member.name)));
  return (season?.matches || []).filter((match) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(match.date || "")) &&
    match.date <= today &&
    resultScore(match.homeScore) !== null && resultScore(match.awayScore) !== null &&
    normalizeHistoryTeamName(match.homeTeam) !== normalizeHistoryTeamName(match.awayTeam) &&
    members.has(normalizeHistoryTeamName(match.homeTeam)) &&
    members.has(normalizeHistoryTeamName(match.awayTeam)));
}

function matchPoints(scored, conceded) {
  return scored > conceded ? 3 : scored === conceded ? 1 : 0;
}

function opponentFormExcludingTeam(matches, opponentKey, excludedKey) {
  let games = 0;
  let points = 0;
  for (const match of matches) {
    const home = normalizeHistoryTeamName(match.homeTeam);
    const away = normalizeHistoryTeamName(match.awayTeam);
    if (home === excludedKey || away === excludedKey) continue;
    if (home !== opponentKey && away !== opponentKey) continue;
    const scored = home === opponentKey ? match.homeScore : match.awayScore;
    const conceded = home === opponentKey ? match.awayScore : match.homeScore;
    points += matchPoints(scored, conceded);
    games += 1;
  }
  // One neutral pseudo-game limits noise when an opponent has played very little.
  return (points + 1.5) / (3 * (games + 1));
}

function qualityRanking(season, team, today) {
  const divisionMatches = scoredDivisionMatches(season, team, today);
  const members = (season.teams || []).filter((member) =>
    normalizedDivision(member) === normalizedDivision(team));
  const scored = members.map((member) => {
    const key = normalizeHistoryTeamName(member.name);
    let games = 0;
    let adjustedPoints = 0;
    let opponentStrength = 0;
    let qualityWins = 0;
    for (const match of divisionMatches) {
      const home = normalizeHistoryTeamName(match.homeTeam);
      const away = normalizeHistoryTeamName(match.awayTeam);
      if (home !== key && away !== key) continue;
      const scoredGoals = home === key ? match.homeScore : match.awayScore;
      const concededGoals = home === key ? match.awayScore : match.homeScore;
      const opponent = home === key ? away : home;
      const opponentForm = opponentFormExcludingTeam(divisionMatches, opponent, key);
      const points = matchPoints(scoredGoals, concededGoals);
      adjustedPoints += points * (0.75 + 0.5 * opponentForm);
      opponentStrength += opponentForm;
      if (points === 3) qualityWins += opponentForm;
      games += 1;
    }
    return {
      name: member.name, games,
      index: games ? Math.round(100 * adjustedPoints / (3.75 * games)) : null,
      opponentsPct: games ? Math.round(100 * opponentStrength / games) : null,
      qualityWins: Math.round(qualityWins * 100) / 100,
    };
  }).filter((row) => row.games > 0);
  const target = scored.find((row) =>
    normalizeHistoryTeamName(row.name) === normalizeHistoryTeamName(team.name));
  if (!target) return null;
  return {
    index: target.index,
    rank: 1 + scored.filter((row) => row.index > target.index).length,
    total: scored.length,
    opponentsPct: target.opponentsPct,
    qualityWins: target.qualityWins,
    games: target.games,
    provisional: true,
    method: "Weighted scored results: wins over opponents with better records against other teams count more; each opponent's direct games against this team are excluded; one neutral pseudo-game smooths small samples.",
  };
}

function emptyRecord() {
  return { games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0,
    goalsAgainst: 0, goalDifference: 0, goalsForPerGame: null,
    goalsAgainstPerGame: null, goalDifferencePerGame: null };
}

function finishRecord(record) {
  const round = (n) => Math.round(n * 100) / 100;
  return {
    ...record,
    goalsForPerGame: record.games ? round(record.goalsFor / record.games) : null,
    goalsAgainstPerGame: record.games ? round(record.goalsAgainst / record.games) : null,
    goalDifferencePerGame: record.games ? round(record.goalDifference / record.games) : null,
  };
}

function addRecord(record, scored, conceded) {
  record.games += 1;
  record.goalsFor += scored;
  record.goalsAgainst += conceded;
  record.goalDifference += scored - conceded;
  if (scored > conceded) record.wins += 1;
  else if (scored === conceded) record.draws += 1;
  else record.losses += 1;
}

/** A read-only, opponent-aware snapshot rendered only when a standings team is tapped. */
export function buildTeamScout(history, currentSeasonId, teamName, today = "9999-12-31") {
  const current = seasonData(history, currentSeasonId);
  const team = matchingTeam(Array.isArray(current?.teams) ? current.teams : [], teamName);
  if (!team) return null;
  const target = historyTeamKey(team.name);
  const seasonRows = divisionStandings(current, team, today);
  const currentRank = seasonRows.find((row) =>
    normalizeHistoryTeamName(row.name) === normalizeHistoryTeamName(team.name));
  const all = emptyRecord();
  const byFormat = { "8v8": emptyRecord(), "11v11": emptyRecord(), unknown: emptyRecord() };
  const recent = [];

  for (const match of completedHistoryMatches(history)) {
    if (match.date > today || !/^\d{4}-\d{2}-\d{2}$/.test(String(match.date))) continue;
    const isHome = historyTeamKey(match.homeTeam) === target;
    const isAway = historyTeamKey(match.awayTeam) === target;
    if (!isHome && !isAway) continue;
    const season = seasonData(history, match.seasonId);
    // Use the exact current season name where possible; never infer 8v8 from D-8.
    const seasonTeam = matchingTeam(season?.teams || [], isHome ? match.homeTeam : match.awayTeam);
    const format = leagueFormat(seasonTeam);
    const goals = isHome ? match.homeScore : match.awayScore;
    const conceded = isHome ? match.awayScore : match.homeScore;
    addRecord(all, goals, conceded);
    addRecord(byFormat[format], goals, conceded);
    recent.push({ date: match.date, season: match.season, format,
      result: goals > conceded ? "W" : goals === conceded ? "D" : "L" });
  }
  recent.sort((a,b) => b.date.localeCompare(a.date));
  const rankings = trackedTeamStats(history, currentSeasonId, team, seasonRows, today);
  return {
    season: current.label || seasonLabel(currentSeasonId),
    division: displayDivision(team),
    currentFormat: leagueFormat(team),
    current: currentRank && currentRank.played ? {
      played: currentRank.played, wins: currentRank.wins, draws: currentRank.draws,
      losses: currentRank.losses, rank: currentRank.rank, teams: seasonRows.length,
    } : null,
    quality: qualityRanking(current, team, today),
    attack: rankings.attack,
    defense: rankings.defense,
    previousSeason: rankings.previousSeason,
    previousSeasonLabel: rankings.previousSeasonLabel,
    overall: finishRecord(all),
    formats: Object.fromEntries(Object.entries(byFormat)
      .map(([format, row]) => [format, finishRecord(row)])),
    recent: recent.slice(0, 5),
    archiveComplete: history?.coverage?.complete === true,
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
    scout: buildTeamScout(history, currentSeasonId, team.name, today),
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
        format: leagueFormat(matchingTeam(
          seasonData(history, match.seasonId)?.teams || [],
          isHome ? match.homeTeam : match.awayTeam,
        )),
      };
    }),
  };
}
