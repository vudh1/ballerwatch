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

// Format multipliers intentionally make a verified 11v11 result 25% more
// consequential than the same 8v8 result. Unknown historical format remains
// usable at a neutral weight rather than being treated as missing history.
const FORMAT_WEIGHTS = Object.freeze({ "8v8": 1, "11v11": 1.25, unknown: 1 });
const FORM_WINDOW = 10;
function allIndexedScoredMatches(history, today) {
  return completedHistoryMatches(history)
    .filter((match) => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(match.date)) &&
      match.date <= today && historyTeamKey(match.homeTeam) !== historyTeamKey(match.awayTeam))
    .sort((a, b) => b.date.localeCompare(a.date) ||
      String(b.startTime || "").localeCompare(String(a.startTime || "")) ||
      b.seasonId.localeCompare(a.seasonId));
}
function matchFormatFromArchive(history, match, teamName) {
  const season = seasonData(history, match.seasonId);
  const metadata = matchingTeam(season?.teams || [], teamName);
  return leagueFormat(metadata);
}
function lastTeamGames(matches, teamName, excludeKey = "", limit = FORM_WINDOW) {
  const key = historyTeamKey(teamName);
  const output = [];
  for (const match of matches) {
    const home = historyTeamKey(match.homeTeam), away = historyTeamKey(match.awayTeam);
    if (excludeKey && (home === excludeKey || away === excludeKey)) continue;
    if (home !== key && away !== key) continue;
    output.push({ match, isHome: home === key, opponent: home === key
      ? match.awayTeam : match.homeTeam });
    if (output.length >= limit) break;
  }
  return output;
}
function weightedRecentRecord(history, entries) {
  let weightedWins = 0, weightedDraws = 0, totalWeight = 0;
  for (const entry of entries) {
    const scored = entry.isHome ? entry.match.homeScore : entry.match.awayScore;
    const conceded = entry.isHome ? entry.match.awayScore : entry.match.homeScore;
    const team = entry.isHome ? entry.match.homeTeam : entry.match.awayTeam;
    const weight = FORMAT_WEIGHTS[matchFormatFromArchive(history, entry.match, team)];
    totalWeight += weight;
    if (scored > conceded) weightedWins += weight;
    else if (scored === conceded) weightedDraws += weight;
  }
  return { games: entries.length,
    weightedWinPct: totalWeight
      ? Math.round(100 * weightedWins / totalWeight) : null,
    // A draw counts as half a win only for the form/strength model.
    form: totalWeight
      ? (weightedWins + 0.5 * weightedDraws + 0.5) / (totalWeight + 1) : 0.5,
  };
}
function opponentFormExcludingTeam(history, matches, opponent, excludedName) {
  const entries = lastTeamGames(matches, opponent, historyTeamKey(excludedName));
  return weightedRecentRecord(history, entries).form;
}
function weightedQualityIndex(history, matches, teamName) {
  const entries = lastTeamGames(matches, teamName);
  if (!entries.length) return null;
  let weightedScore = 0;
  let wins = 0, draws = 0, losses = 0;
  let weightedWins = 0, totalWeight = 0;
  let opponentStrength = 0, qualityWins = 0;
  for (const entry of entries) {
    const match = entry.match;
    const scored = entry.isHome ? match.homeScore : match.awayScore;
    const conceded = entry.isHome ? match.awayScore : match.homeScore;
    const format = matchFormatFromArchive(history, match, teamName);
    const weight = FORMAT_WEIGHTS[format];
    const strength = opponentFormExcludingTeam(history, matches, entry.opponent, teamName);
    const outcome = scored > conceded ? 1 : scored === conceded ? 0.5 : 0;
    if (outcome === 1) { wins++; weightedWins += weight; qualityWins += strength; }
    else if (outcome === 0.5) draws++;
    else losses++;
    totalWeight += weight;
    opponentStrength += strength;
    weightedScore += outcome * weight * (0.75 + 0.5 * strength);
  }
  // Divide by the strongest possible ten-match weighted outcome, keeping
  // the result within 0–100. 11v11 wins count more than 8v8 wins.
  const index = Math.round(100 * weightedScore / (entries.length * 1.25 * 1.25));
  return {
    index: Math.max(0, Math.min(100, index)),
    games: entries.length, wins, draws, losses,
    weightedWinPct: Math.round(100 * weightedWins / totalWeight),
    opponentsPct: Math.round(100 * opponentStrength / entries.length),
    qualityWins: Math.round(100 * qualityWins) / 100,
    provisional: true,
  };
}
function qualityRanking(history, season, team, today) {
  const matches = allIndexedScoredMatches(history, today);
  const peers = (season?.teams || [])
    .filter((member) => normalizedDivision(member) === normalizedDivision(team))
    .map((member) => ({ name: member.name,
      ...weightedQualityIndex(history, matches, member.name) }))
    .filter((member) => Number.isInteger(member.index));
  const target = peers.find((member) =>
    normalizeHistoryTeamName(member.name) === normalizeHistoryTeamName(team.name));
  if (!target) return null;
  return {
    ...target,
    rank: 1 + peers.filter((peer) => peer.index > target.index).length,
    total: peers.length,
    lastGames: FORM_WINDOW,
    provisional: true,
    method: "Last ten indexed scored matches across all seasons and formats. 11v11 games receive 1.25× weight; 8v8 and unverified legacy games 1×. Wins against opponents with stronger recent records against others count more. Opponents' games against the rated team are excluded; early records are smoothed. Not betting odds.",
  };
}

/** Public, last-ten weighted win record for a team appearing in a fixture. */
export function buildTeamRecentForm(history, teamName, today = "9999-12-31") {
  if (!teamName || !String(teamName).trim()) return null;
  const matches = allIndexedScoredMatches(history, today);
  const games = lastTeamGames(matches, teamName);
  if (!games.length) return null;
  const model = weightedRecentRecord(history, games);
  const wins = games.filter(({match,isHome}) =>
    (isHome ? match.homeScore > match.awayScore : match.awayScore > match.homeScore)).length;
  return { team: teamName, games: model.games, wins,
    weightedWinPct: model.weightedWinPct, formWindow: FORM_WINDOW };
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
    quality: qualityRanking(history, current, team, today),
    attack: rankings.attack,
    defense: rankings.defense,
    previousSeason: rankings.previousSeason,
    previousSeasonLabel: rankings.previousSeasonLabel,
    overall: finishRecord(all),
    formats: Object.fromEntries(Object.entries(byFormat)
      .map(([format, row]) => [format, finishRecord(row)])),
    recent: recent.slice(0, 5),
    recentTen: buildTeamRecentForm(history, team.name, today),
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
