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

// Only strip conventional club suffixes. Arbitrary fuzzy equality is unsafe for stats.
export function historyTeamKey(value) {
  const core = normalizeHistoryTeamName(value)
    .replace(/(?: (?:football|soccer) club| fc| sc)+$/g, "")
    .trim();
  const parts = core.split(" ");
  const last = parts.at(-1) || "";
  // Singular/plural variants of the final club-name word are equivalent,
  // but don't strip s from short words or natural -ss endings.
  if (last.length >= 4 && last.endsWith("s") && !last.endsWith("ss")) {
    parts[parts.length - 1] = last.endsWith("ies") && last.length > 4
      ? last.slice(0, -3) + "y"
      : last.slice(0, -1);
  }
  return parts.join(" ");
}

function historyQuestionAliases(name) {
  const original = normalizeHistoryTeamName(name);
  const withoutClubSuffix = original.replace(/(?: (?:football|soccer) club| fc| sc)+$/g, "").trim();
  const aliases = new Set([original, withoutClubSuffix, historyTeamKey(name)]);
  const base = historyTeamKey(name);
  const words = base.split(" ");
  const last = words.at(-1) || "";
  if (last.length >= 3) {
    words[words.length - 1] = last.endsWith("y")
      ? last.slice(0, -1) + "ies" : last + "s";
    aliases.add(words.join(" "));
    if (original.endsWith(" fc")) aliases.add(words.join(" ") + " fc");
    if (original.endsWith(" sc")) aliases.add(words.join(" ") + " sc");
  }
  if (original.endsWith(" fc")) aliases.add(base + " fc");
  if (original.endsWith(" sc")) aliases.add(base + " sc");
  return aliases;
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
  const match = String(question || "").match(/\b(winter|spring|summer|fall)[\s-]+(20\d{2})\b/i);
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
  const names = historyTeamNames(history);
  const input = normalizedQuestion(question);
  const items = names.map(name => ({
    name, exact: normalizeHistoryTeamName(name), alias: historyTeamKey(name),
  }));
  // Prefer the longest official name at a given position; then accept club-suffix
  // aliases only when no longer exact name covers that text.
  const candidates = [];
  for (const item of items) {
    for (const needle of historyQuestionAliases(item.name)) {
      if (!needle || needle.split(" ").length < 2 && needle !== item.exact) continue;
      const padded = ` ${needle} `;
      let at = input.indexOf(padded);
      while (at >= 0) {
        candidates.push({ ...item, at, length: needle.length, exactMatch: needle === item.exact });
        at = input.indexOf(padded, at + 1);
      }
    }
  }
  candidates.sort((a,b) =>
    Number(b.exactMatch) - Number(a.exactMatch) ||
    b.length - a.length || a.at - b.at || a.name.localeCompare(b.name));
  const matched = [];
  const spans = [];
  const identities = new Set();
  for (const candidate of candidates) {
    if (spans.some(span => candidate.at < span.end && candidate.at + candidate.length > span.start)) continue;
    if (identities.has(candidate.alias)) continue;
    const official = items
      .filter(item => item.alias === candidate.alias)
      .sort((a,b) => b.exact.length - a.exact.length || a.name.localeCompare(b.name))[0];
    matched.push({ name: candidate.exactMatch ? candidate.name : official.name, at: candidate.at });
    identities.add(candidate.alias);
    spans.push({start: candidate.at, end: candidate.at + candidate.length});
  }
  if (matched.length) return matched.sort((a,b) => a.at - b.at).slice(0,2).map(x => x.name);

  const available = new Map(items.map(item => [item.exact,item.name]));
  return (Array.isArray(contextTeams) ? contextTeams : [])
    .map(name => available.get(normalizeHistoryTeamName(name)) ||
      items.find(item => item.alias === historyTeamKey(name))?.name)
    .filter(Boolean).slice(0,2);
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
  const target = historyTeamKey(teamName);
  if (historyTeamKey(match?.homeTeam) === target) return "home";
  if (historyTeamKey(match?.awayTeam) === target) return "away";
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
  const a = historyTeamKey(teamA);
  const b = historyTeamKey(teamB);
  const matches = completedHistoryMatches(history, seasonId)
    .filter((match) => {
      const home = historyTeamKey(match.homeTeam);
      const away = historyTeamKey(match.awayTeam);
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
  const target = historyTeamKey(teamName);
  const labels = [];
  for (const season of seasonMatches(history)) {
    const appears = (season?.teams || []).some((team) =>
      historyTeamKey(team?.name) === target) ||
      (season?.matches || []).some((match) =>
        historyTeamKey(match?.homeTeam) === target ||
        historyTeamKey(match?.awayTeam) === target);
    if (appears) labels.push(season.label || seasonLabel(season.seasonId));
  }
  return labels;
}

function formatRecord(record) {
  return `${record.wins}-${record.draws}-${record.losses} (W-D-L)`;
}

function formatMatch(match) {
  const date = String(match?.date || "");
  return `${match.season} · ${date}: ${match.homeTeam} ${match.homeScore}–${match.awayScore} ${match.awayTeam}`;
}
function historyCoverageScope(history) {
  const coverage = history?.coverage || {};
  const first = coverage.firstSeason ? seasonLabel(coverage.firstSeason) : "";
  const last = coverage.lastSeason ? seasonLabel(coverage.lastSeason) : "";
  const range = first && last ? `${first}–${last}` : "";
  if (coverage.complete === false) {
    const indexed = Number(coverage.seasonCount || history?.seasons?.length || 0);
    const requested = Number(coverage.requestedSeasonCount || 0);
    const count = requested ? `${indexed}/${requested} seasons` : `${indexed} seasons`;
    return {
      label: `indexed RATS history (partial${range ? `, ${range}` : ""})`,
      warning: `History index is still rebuilding: ${count} currently available. This is not an all-time record yet.`,
    };
  }
  return {
    label: range ? `indexed RATS seasons (${range})` : "indexed RATS seasons",
    warning: "Records cover only indexed scored games; older or unpublished seasons may be missing.",
  };
}

function hasAnyScoredHistory(history) {
  if (Number(history?.coverage?.completedMatchCount || 0) > 0) return true;
  return completedHistoryMatches(history).length > 0;
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
      ready: false,
    };
  }

  if (!hasAnyScoredHistory(history)) {
    return {
      reply: "RATS historical scores are rebuilding right now. Try again after the next league refresh.",
      teams: [],
      ready: false,
    };
  }

  const seasonId = historySeasonFromQuestion(question);
  if (seasonId && !history.seasons.some((season) => season?.seasonId === seasonId)) {
    return {
      reply: `I don't have ${seasonLabel(seasonId)} in the RATS history index.`,
      teams: [],
      ready: true,
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
      ready: true,
    };
  }

  // Explicit two-club questions must identify TWO clubs. Previously a typo
  // in the opponent silently turned head-to-head into a single-team record.
  const asksForPair = /\b(?:vs\.?|versus|against)\b/i.test(question) ||
    /\b(?:have|did)\b[^?!.]{0,140}\band\b[^?!.]{0,100}\b(?:played|met|faced)\b/i.test(question);
  if (asksForPair && teams.length !== 2) {
    return {
      reply: teams.length
        ? "I recognized " + teams[0] + ", but couldn't identify both RATS clubs. Please use two full team names for a head-to-head record."
        : "I couldn't identify both RATS clubs. Please use their published team names.",
      teams: [],
      ready: true,
    };
  }
  if (teams.length === 2 && historyTeamKey(teams[0]) === historyTeamKey(teams[1])) {
    return {
      reply:"Those team names resolve to the same club. Please specify two different teams.",
      teams:[],
      ready:true,
    };
  }

  const coverageScope = historyCoverageScope(history);
  const scope = seasonId ? seasonLabel(seasonId) : coverageScope.label;
  const coverageWarning = seasonId ? "" : coverageScope.warning;
  if (teams.length >= 2) {
    const h2h = historyHeadToHead(history, teams[0], teams[1], seasonId);
    if (!h2h.matches.length) {
      return {
        reply: [
          ...(coverageWarning ? [coverageWarning] : []),
          `I found no scored meeting between ${teams[0]} and ${teams[1]} in ${scope}.`,
        ].join("\n"),
        teams: teams.slice(0, 2),
        ready: true,
      };
    }
    const recent = h2h.matches.slice(-5).reverse();
    return {
      reply: [
        ...(coverageWarning ? [coverageWarning] : []),
        `${teams[0]} vs ${teams[1]} — ${scope}`,
        `${h2h.matches.length} meeting${h2h.matches.length === 1 ? "" : "s"} · ${teams[0]} ${h2h.winsA}W · ${h2h.draws}D · ${teams[1]} ${h2h.winsB}W`,
        ...recent.map((match) => `• ${formatMatch(match)}`),
      ].join("\n"),
      teams: teams.slice(0, 2),
      ready: true,
    };
  }

  const team = teams[0];
  const lower = String(question || "").toLowerCase();
  if (/\b(which|what) seasons?\b|\bseason history\b/.test(lower)) {
    const labels = teamSeasonLabels(history, team);
    return {
      reply: [
        ...(coverageWarning ? [coverageWarning] : []),
        labels.length
          ? `${team} appears in ${labels.length} indexed RATS season${labels.length === 1 ? "" : "s"}:\n${labels.map((label) => `• ${label}`).join("\n")}`
          : `I found no indexed RATS seasons for ${team}.`,
      ].join("\n"),
      teams: [team],
      ready: true,
    };
  }

  const record = historyRecord(history, team, seasonId);
  if (!record.games) {
    return {
      reply: [
        ...(coverageWarning ? [coverageWarning] : []),
        `I found ${team} in the RATS history index, but no completed scored matches in ${scope}.`,
      ].join("\n"),
      teams: [team],
      ready: true,
    };
  }
  const seasonCount = seasonId ? 1 : record.seasons.length;
  return {
    reply: [
      ...(coverageWarning ? [coverageWarning] : []),
      `${team} — ${scope}`,
      `Record: ${formatRecord(record)} across ${record.games} scored match${record.games === 1 ? "" : "es"}`,
      `Goals: ${record.goalsFor} for, ${record.goalsAgainst} against · ${seasonCount} season${seasonCount === 1 ? "" : "s"} with scored results`,
    ].join("\n"),
    teams: [team],
    ready: true,
  };
}
