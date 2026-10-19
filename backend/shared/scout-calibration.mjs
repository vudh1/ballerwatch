/**
 * Leak-free, seasonal walk-forward calibration of RATS 3-way forecasts.
 *
 * Every score for season S uses features frozen at the START of S, trained
 * only with previously completed seasons. The newest season is excluded from
 * tuning until complete. No API calls, free-model prompts, or user/RSVP data.
 * Rebuilt from encrypted historical scores by the hourly scouting job.
 */
import { blendGoalForecast } from "./scout-goals.mjs";
import { completedHistoryMatches, historyTeamKey } from "./rats-history.mjs";

export const DEFAULT_SCOUT_WEIGHTS = Object.freeze({
  form: 0.75, division: 0.18, h2h: 0.045,
  draw: 0.20, decay: 0.94, format11: 1.25,
});
/**
 * Independently holdout-validated production weights (Summer 2026).
 * Explicitly pinned by the v8.11.1 release; the hourly snapshot must not
 * change these based on a later training run. Offline calibration still
 * compares candidates against DEFAULT_SCOUT_WEIGHTS without affecting live.
 */
export const PRODUCTION_SCOUT_WEIGHTS = Object.freeze({
  form: 0.55, division: 0.28, h2h: 0.08,
  draw: 0.16, decay: 0.98, format11: 1.25,
});
const SEASONS = ["winter", "spring", "summer", "fall"];
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const bounded = (number, lo, hi) => Math.min(hi, Math.max(lo, number));

/** Weight scheduled cross-division opponents without amplifying thin samples. */
export function opponentTierWeight(ownTier, opposingTier) {
  if (!Number.isFinite(ownTier) || ownTier <= 0 ||
      !Number.isFinite(opposingTier) || opposingTier <= 0) return 1;
  return bounded(opposingTier / ownTier, 0.8, 1.25);
}

function chronologicalKey(value) {
  const match = /^(winter|spring|summer|fall)-(\d{4})$/i.exec(String(value || ""));
  return match ? Number(match[2]) * 4 + SEASONS.indexOf(match[1].toLowerCase()) : null;
}
export function scoutingTier(team) {
  if (!team) return 1;
  const labels = [team.divisionLabel, team.leagueName, team.division]
    .map((item) => String(item || "").trim());
  const weights = { "1": 1.30, "2a": 1.18, "2b": 1.10,
    "2c": 1.03, "2": 1.10, "3": 0.90 };
  const pattern = /(?:^|[^a-z0-9])(?:d|division)[\s_-]*([123])[\s_-]*([abc])?(?=$|[^a-z0-9])/i;
  for (const label of labels) {
    const match = pattern.exec(label);
    if (match?.[2]) return weights[match[1] + match[2].toLowerCase()] || 1;
    if (/^2[abc]$/i.test(label)) return weights[label.toLowerCase()] || 1;
  }
  for (const label of labels) {
    const match = pattern.exec(label);
    if (match) return weights[match[1]] || 1;
    if (/^[123]$/i.test(label)) return weights[label] || 1;
  }
  return 1;
}
export function scoutingFormat(team) {
  if (!team) return "unknown";
  // Mirror published league-format interpretation in league-standings.mjs.
  const leagueName = String(team.leagueName || "").trim();
  const alternative = [team.day, team.gender, team.division, team.divisionLabel]
    .map((value) => String(value || "")).join(" ");
  const label = leagueName || alternative;
  if (/\b8\s*(?:v|vs|x|on)\s*8\b/i.test(label)) return "8v8";
  if (leagueName || /\b11\s*(?:v|vs|x|on)\s*11\b/i.test(alternative)) return "11v11";
  return "unknown";
}
function seasonTeams(season) {
  const map = new Map();
  for (const team of season?.teams || []) {
    const key = historyTeamKey(team.name);
    if (!key) continue;
    // Club names repeated in different divisions are ambiguous. Neutralize
    // their historical tier and format rather than mislabel a result.
    if (map.has(key)) map.set(key, null);
    else map.set(key, team);
  }
  return map;
}
function featuresForSeason(season) {
  const teams = seasonTeams(season);
  return (Array.isArray(season?.matches) ? season.matches : [])
    .filter((match) => /^\d{4}-\d{2}-\d{2}$/.test(String(match.date || "")) &&
      match.homeScore !== null && match.homeScore !== undefined &&
      match.awayScore !== null && match.awayScore !== undefined &&
      Number.isFinite(Number(match.homeScore)) &&
      Number.isFinite(Number(match.awayScore)) &&
      Number(match.homeScore) >= 0 && Number(match.awayScore) >= 0 &&
      Number(match.homeScore) <= 40 && Number(match.awayScore) <= 40 &&
      historyTeamKey(match.homeTeam) !== historyTeamKey(match.awayTeam))
    .map((match) => {
      const home = teams.get(historyTeamKey(match.homeTeam));
      const away = teams.get(historyTeamKey(match.awayTeam));
      return {
        date: match.date,
        home: historyTeamKey(match.homeTeam),
        away: historyTeamKey(match.awayTeam),
        homeScore: Number(match.homeScore),
        awayScore: Number(match.awayScore),
        homeTier: scoutingTier(home), awayTier: scoutingTier(away),
        homeFormat: scoutingFormat(home), awayFormat: scoutingFormat(away),
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

/** Same predictor is used for offline tuning and live prepared match cards. */
export function forecastFromFeatures(ours, theirs, meetings, settings = DEFAULT_SCOUT_WEIGHTS) {
  const weights = { ...DEFAULT_SCOUT_WEIGHTS, ...(settings || {}) };
  const summarize = (entries) => {
    let wins = 0, draws = 0, total = 0, level = 0, recencyTotal = 0;
    for (const [i, entry] of entries.slice(0, 10).entries()) {
      const recent = Math.pow(weights.decay, i);
      const factor = entry.format === "11v11" ? weights.format11 : 1;
      const weight = recent * factor * (Number(entry.tier) || 1) *
        opponentTierWeight(entry.tier, entry.opponentTier);
      wins += (entry.scored > entry.conceded ? 1 : 0) * weight;
      draws += (entry.scored === entry.conceded ? 1 : 0) * weight;
      total += weight;
      recencyTotal += recent;
      level += (Number(entry.tier) || 1) * recent;
    }
    return {
      form: total ? (wins + 0.5 * draws + 0.5) / (total + 1) : 0.5,
      drawRate: total ? draws / total : weights.draw,
      tier: recencyTotal ? level / recencyTotal : 1,
    };
  };
  const first = summarize(ours), second = summarize(theirs);
  const observed = bounded((ours.length + theirs.length) / 20, 0, 1);
  let share = 0.5 + ((first.form - second.form) * weights.form +
    (first.tier - second.tier) * weights.division) * observed;
  let meetingPoints = 0, meetingWeight = 0, meetingDraws = 0;
  for (const [i, match] of meetings.slice(0, 5).entries()) {
    const format = match.format === "11v11" ? weights.format11 : 1;
    const weight = format * (match.tier || 1) * Math.pow(0.85, i);
    meetingWeight += weight;
    meetingPoints += (match.scored > match.conceded ? 1 :
      match.scored === match.conceded ? 0.5 : 0) * weight;
    if (match.scored === match.conceded) meetingDraws += weight;
  }
  const h2h = (meetingPoints + 1) / (meetingWeight + 2);
  const influence = Math.min(0.22, meetings.length * weights.h2h);
  share = bounded(share * (1 - influence) + h2h * influence, 0.13, 0.87);
  const drawShare = bounded(weights.draw +
    ((first.drawRate + second.drawRate) / 2 - weights.draw) * 0.5 * observed +
    (meetingWeight ? (meetingDraws / meetingWeight - weights.draw) * influence * 0.2 : 0),
    0.12, 0.34);
  return blendGoalForecast({
    win: (1 - drawShare) * share,
    draw: drawShare,
    loss: (1 - drawShare) * (1 - share),
  }, ours, theirs, weights.goals);
}
export function roundThreeWay(probs) {
  // Normalize even partially missing/nonfinite caller inputs, then allocate
  // the twenty 5% units by largest remainder rather than clipping the draw.
  const values = [probs?.win, probs?.draw, probs?.loss].map((value) =>
    Number.isFinite(value) && value > 0 ? value : 0);
  const largest = Math.max(...values);
  const scaled = largest > 0 ? values.map((value) => value / largest) : [];
  const total = scaled.reduce((sum, value) => sum + value, 0);
  const safe = total > 0 ? scaled.map((value) => value / total) : [0.39, 0.22, 0.39];
  const exact = safe.map((value) => value * 20);
  const units = exact.map(Math.floor);
  const remaining = 20 - units.reduce((sum, value) => sum + value, 0);
  const order = [0, 1, 2].sort((a, b) => (exact[b] - units[b]) -
    (exact[a] - units[a]) || a - b);
  for (let i = 0; i < remaining; i += 1) units[order[i]] += 1;
  return { winPct: units[0] * 5, drawPct: units[1] * 5, lossPct: units[2] * 5 };
}

function eventForSide(match, home) {
  return {
    date: match.date,
    scored: home ? match.homeScore : match.awayScore,
    conceded: home ? match.awayScore : match.homeScore,
    tier: home ? match.homeTier : match.awayTier,
    opponentTier: home ? match.awayTier : match.homeTier,
    format: home ? match.homeFormat : match.awayFormat,
    opponent: home ? match.away : match.home,
  };
}
function appendSeason(prior, games) {
  for (const match of games) {
    for (const [key, home] of [[match.home, true], [match.away, false]]) {
      if (!prior.has(key)) prior.set(key, []);
      prior.get(key).push(eventForSide(match, home));
    }
  }
  for (const values of prior.values()) {
    values.sort((a, b) => b.date.localeCompare(a.date));
    if (values.length > 60) values.length = 60;
  }
}
function makeSamples(prior, games) {
  const observations = [];
  const nextTeamResults = new Map();
  for (const match of games) {
    for (const [key, won, lost] of [
      [match.home, match.homeScore, match.awayScore],
      [match.away, match.awayScore, match.homeScore],
    ]) {
      if (!nextTeamResults.has(key)) nextTeamResults.set(key, []);
      nextTeamResults.get(key).push(won > lost ? 1 : won === lost ? 0.5 : 0);
    }
    const home = prior.get(match.home) || [];
    const away = prior.get(match.away) || [];
    // Compare only teams that actually existed in earlier seasons.
    if (!home.length || !away.length) continue;
    observations.push({
      ours: home.slice(0, 10), theirs: away.slice(0, 10),
      meetings: home.filter((entry) => entry.opponent === match.away).slice(0, 5),
      result: match.homeScore > match.awayScore ? 0 :
        match.homeScore === match.awayScore ? 1 : 2,
    });
  }
  return { observations, nextTeamResults };
}
function brier(observation, weights) {
  const p = forecastFromFeatures(observation.ours, observation.theirs,
    observation.meetings, weights);
  const actual = [0, 1, 2].map((index) => observation.result === index ? 1 : 0);
  return [p.win, p.draw, p.loss].reduce((sum, value, index) =>
    sum + Math.pow(value - actual[index], 2), 0);
}
function calculateScore(folds, weights) {
  let score = 0, count = 0;
  for (const fold of folds) for (const entry of fold.observations) {
    score += brier(entry, weights);
    count += 1;
  }
  return count ? { score: score / count, count } : { score: null, count: 0 };
}
function candidates() {
  const out = [DEFAULT_SCOUT_WEIGHTS];
  for (const form of [0.55, 0.75, 0.95]) {
    for (const division of [0.08, 0.18, 0.28]) {
      for (const h2h of [0, 0.045, 0.08]) {
        for (const draw of [0.16, 0.20, 0.24]) {
          for (const decay of [0.90, 0.94, 0.98]) {
            out.push({ form, division, h2h, draw, decay, format11: 1.25 });
          }
        }
      }
    }
  }
  return out;
}
const WEIGHT_SETS = candidates();
function pickWeights(folds, minimum = 80) {
  const base = calculateScore(folds, DEFAULT_SCOUT_WEIGHTS);
  if (base.count < minimum) return {
    weights: DEFAULT_SCOUT_WEIGHTS, selected: false, baseline: base,
  };
  let best = { weights: DEFAULT_SCOUT_WEIGHTS, ...base };
  for (const weights of WEIGHT_SETS) {
    const score = calculateScore(folds, weights);
    if (score.score < best.score) best = { weights, ...score };
  }
  // No change for tiny or unproven lifts. Tie always favors the current model.
  if (base.score - best.score < 0.002) {
    return { weights: DEFAULT_SCOUT_WEIGHTS, selected: false, baseline: base };
  }
  return { weights: best.weights, selected: true, baseline: base };
}
/**
 * Mirror the published 0–100 opponent-adjusted form index using ONLY past
 * matches. This measures whether an old quality score predicts performance
 * in the next season; it is NOT itself a win probability.
 */
function priorQualityIndex(prior, team, weights = DEFAULT_SCOUT_WEIGHTS) {
  const entries = (prior.get(team) || []).slice(0, 10);
  let score = 0, maxScore = 0;
  for (const [i, entry] of entries.entries()) {
    const recent = Math.pow(weights.decay, i);
    const format = entry.format === "11v11" ? weights.format11 : 1;
    const importance = recent * (entry.tier || 1) * format *
      opponentTierWeight(entry.tier, entry.opponentTier);
    const opponentGames = (prior.get(entry.opponent) || [])
      .filter((game) => game.opponent !== team).slice(0, 10);
    let opponentWins = 0, opponentDraws = 0, total = 0;
    for (const [j, game] of opponentGames.entries()) {
      const w = Math.pow(weights.decay, j) * (game.tier || 1) *
        opponentTierWeight(game.tier, game.opponentTier) *
        (game.format === "11v11" ? weights.format11 : 1);
      total += w;
      if (game.scored > game.conceded) opponentWins += w;
      else if (game.scored === game.conceded) opponentDraws += w;
    }
    const opponentForm = total ? (opponentWins + 0.5 * opponentDraws + 0.5) /
      (total + 1) : 0.5;
    const outcome = entry.scored > entry.conceded ? 1 :
      entry.scored === entry.conceded ? 0.5 : 0;
    score += outcome * importance * (0.75 + 0.5 * opponentForm);
    maxScore += importance * 1.25;
  }
  return maxScore ? bounded(score / maxScore, 0, 1) : null;
}
function qualityCorrelation(pairs) {
  if (pairs.length < 12) return null;
  const avgX = pairs.reduce((sum, p) => sum + p[0], 0) / pairs.length;
  const avgY = pairs.reduce((sum, p) => sum + p[1], 0) / pairs.length;
  let cov = 0, varianceX = 0, varianceY = 0;
  for (const [x, y] of pairs) {
    cov += (x - avgX) * (y - avgY);
    varianceX += Math.pow(x - avgX, 2);
    varianceY += Math.pow(y - avgY, 2);
  }
  return varianceX && varianceY
    ? round(cov / Math.sqrt(varianceX * varianceY), 3) : null;
}

/**
 * Train on full prior seasons; validate on the immediate *next* season.
 * Skip the current in-progress season entirely and expose only aggregate
 * scores, fold labels, and weights. Never expose the raw match archive.
 */
export function tuneScoutingWeights(history, currentSeasonId = "") {
  const seasons = (Array.isArray(history?.seasons) ? history.seasons : [])
    .filter((season) => chronologicalKey(season.seasonId) !== null &&
      season.seasonId !== currentSeasonId &&
      (!currentSeasonId || chronologicalKey(currentSeasonId) == null ||
        chronologicalKey(season.seasonId) < chronologicalKey(currentSeasonId)))
    .map((season) => ({
      seasonId: season.seasonId,
      seasonKey: chronologicalKey(season.seasonId),
      games: featuresForSeason(season),
    }))
    .filter((season) => season.games.length >= 2)
    .sort((a, b) => a.seasonKey - b.seasonKey);
  const prior = new Map();
  const evaluated = [];
  const summaries = [];
  const qualityPairs = [];
  for (const season of seasons) {
    const { observations, nextTeamResults } = makeSamples(prior, season.games);
    if (evaluated.length || prior.size) {
      const selected = pickWeights(evaluated, 80);
      const fold = { seasonId: season.seasonId, observations };
      const legacy = calculateScore([fold], DEFAULT_SCOUT_WEIGHTS);
      const tested = calculateScore([fold], selected.weights);
      if (legacy.count) {
        summaries.push({
          seasonId: season.seasonId, predictedGames: legacy.count,
          legacyBrier: round(legacy.score), walkForwardBrier: round(tested.score),
          model: selected.selected ? "tuned" : "baseline",
        });
        evaluated.push(fold);
      }
      for (const [team, outcomes] of nextTeamResults) {
        const previous = (prior.get(team) || []).slice(0, 10);
        if (previous.length < 3 || outcomes.length < 3) continue;
        const average = outcomes.reduce((sum, outcome) => sum + outcome, 0) /
          outcomes.length;
        const previousQuality = priorQualityIndex(prior, team, DEFAULT_SCOUT_WEIGHTS);
        if (previousQuality !== null) qualityPairs.push([previousQuality, average]);
      }
    }
    appendSeason(prior, season.games);
  }
  const selection = pickWeights(evaluated, 80);
  const base = calculateScore(evaluated, DEFAULT_SCOUT_WEIGHTS);
  const tuned = calculateScore(evaluated, selection.weights);
  const sum = (name) => summaries.reduce((total, fold) =>
    total + fold[name] * fold.predictedGames, 0);
  const count = summaries.reduce((total, fold) => total + fold.predictedGames, 0);
  const walkForwardBrier = count ? sum("walkForwardBrier") / count : null;
  const baselineBrier = count ? sum("legacyBrier") / count : null;
  const validatedLift = count >= 80 && walkForwardBrier != null &&
    baselineBrier - walkForwardBrier >= 0.001;
  // Final safeguard: only promote tuned weights if both historical holdout
  // and aggregate forward trials beat the baseline with sufficient evidence.
  const promoted = Boolean(selection.selected && validatedLift &&
    base.score - tuned.score >= 0.002);
  const weights = promoted ? selection.weights : DEFAULT_SCOUT_WEIGHTS;
  return {
    modelVersion: 1,
    status: promoted ? "tuned" : "baseline-retained",
    weights: { ...weights },
    archiveSeasons: seasons.length,
    trainedFolds: evaluated.length,
    evaluatedGames: count,
    nextSeasonBrier: walkForwardBrier == null ? null : round(walkForwardBrier),
    baselineNextSeasonBrier: baselineBrier == null ? null : round(baselineBrier),
    qualityNextSeasonCorrelation: qualityCorrelation(qualityPairs),
    qualityTeamPairs: qualityPairs.length,
    folds: summaries.slice(-20),
    note: "Forward tests freeze data at each season start; the current season never trains on its own scores. If no significant lift, baseline stays active.",
  };
}

/**
 * Transform the already-indexed last-ten game entries into the exact same
 * inputs used by walk-forward calibration. No expensive archive scan here.
 */
export function gamePredictionFeatures(history, entries, tierResolver, formatResolver) {
  return entries.map(({ match, isHome, opponent }) => {
    const team = isHome ? match.homeTeam : match.awayTeam;
    return {
      date: match.date, opponent: historyTeamKey(opponent),
      scored: isHome ? match.homeScore : match.awayScore,
      conceded: isHome ? match.awayScore : match.homeScore,
      tier: tierResolver(history, match, team),
      opponentTier: tierResolver(history, match, opponent),
      format: formatResolver(history, match, team),
    };
  });
}
