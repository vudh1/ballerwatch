/**
 * Grounded, privacy-safe BallerWatch AI scouting answers from hourly snapshots.
 * Never reads RATS history or generates a new prediction on an HTTP GET.
 */
const SOURCE = [{ label: "RATS schedule and standings",
  url: "https://seattlerats.org/schedule--standings" }];

function key(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function containsName(question, name) {
  const needle = key(name);
  return Boolean(needle && (" " + key(question) + " ").includes(" " + needle + " "));
}
export function isScoutingQuestion(question) {
  const text = String(question || "");
  return /\b(?:scout(?:ing)?|backtest(?:ing)?|accuracy|accurate|precision|precise|calibrat(?:ion|ed|e)?|train(?:ing|ed)?|model performance|model weights|strength|stronger|strongest|form|performance|win(?:ning)?\s+(?:chance|probability|rate|percentage)|odds|predict(?:ion|ed)?|likely to win|attack(?:ing)?|defen(?:se|ce|sive)|quality score|opponent.adjusted|last\s+(?:five|5|ten|10)\s+(?:games|matches)|draw\s+(?:chance|probability)|loss\s+(?:chance|probability)|team rankings?)\b/i
    .test(text) || /\bcompare\b.{0,80}\b(?:teams?|clubs?|form|attack|defense|scoring)\b/i.test(text);
}
function reportRows(index) {
  const rows = [];
  for (const [id, value] of Object.entries(index?.reports || {})) {
    if (!value?.scout || !Array.isArray(value.matches)) continue;
    let division, team;
    try { [division, team] = JSON.parse(id); } catch { continue; }
    if (typeof team !== "string" || typeof division !== "string") continue;
    rows.push({ division, team, report: value });
  }
  return rows;
}
function selectReport(candidates, question, name) {
  const choices = candidates.filter((row) => key(row.team) === key(name));
  if (choices.length <= 1) return { choice: choices[0] || null };
  const exactDivision = choices.filter((row) =>
    containsName(question, row.report.scout?.division || "") ||
    containsName(question, row.division));
  if (exactDivision.length === 1) return { choice: exactDivision[0] };
  return { ambiguity: choices.map((row) => row.report.scout?.division || row.division) };
}
function scoutingSummary(row) {
  const scout = row.report.scout;
  const quality = scout.quality, recent = scout.recentTen, current = scout.current;
  const lines = [
    row.team + " · " + scout.division + " · " + scout.season,
    quality ? "Opponent-adjusted form: " + quality.index + "/100 · #" + quality.rank +
      " of " + quality.total + " division teams (" + quality.games + " recent scored games)."
      : "Opponent-adjusted form: not enough indexed results.",
    current ? "Current season: " + current.wins + "W–" + current.draws + "D–" +
      current.losses + "L." : "Current season: no indexed scores yet.",
    recent?.weightedWinPct != null ? "Last " + recent.games +
      " scored games: " + recent.weightedWinPct + "% division/format-weighted wins."
      : "Recent weighted wins: unavailable.",
    scout.attack?.perGame != null ? "Attack (last " + scout.attack.games + "): " +
      scout.attack.perGame + " goals/game · rank #" + scout.attack.rank + "/" +
      scout.attack.total + "." : "Attack: insufficient recent scores.",
    scout.defense?.perGame != null ? "Defense (last " + scout.defense.games + "): " +
      scout.defense.perGame + " goals allowed/game · rank #" + scout.defense.rank +
      "/" + scout.defense.total + "." : "Defense: insufficient recent scores.",
    scout.overall?.games ? "All-time indexed: " + scout.overall.wins + "W–" +
      scout.overall.draws + "D–" + scout.overall.losses + "L (" +
      scout.overall.games + " scored games)." : "All-time indexed: no scored matches.",
  ];
  if (!scout.archiveComplete) lines.push("Archive coverage is partial.");
  lines.push("Division, opponent, format and recency-adjusted; provisional, not betting odds.");
  return lines.join("\n");
}
function matchupAnswer(match) {
  if (!Number.isFinite(match?.winPct) || !Number.isFinite(match?.drawPct) ||
      !Number.isFinite(match?.lossPct)) return null;
  return [
    match.team + " vs " + match.opponent + " · prepared matchup estimate",
    "Win ~" + match.winPct + "% · Draw ~" + match.drawPct + "% · Loss ~" +
      match.lossPct + "% (from " + match.team + "'s perspective).",
    "Evidence: last " + match.teamGames + "/" + match.opponentGames +
      " scored games and " + match.headToHeadGames + " prior meeting(s).",
    match.sampleLimited ? "Limited sample; prediction is especially uncertain." : "",
    "Provisional rounded three-outcome model, not calibrated betting odds.",
  ].filter(Boolean).join("\n");
}
/** Returns null when this is not a scouting question, and never fabricates odds. */
export function answerScoutingQuestion(question, index, { contextTeams = [] } = {}) {
  if (!isScoutingQuestion(question)) return null;
  const raw = String(question || "").slice(0, 600);
  if (/\b(?:backtest(?:ing)?|accuracy|accurate|precision|precise|calibrat\w*|train(?:ing|ed)?|model (?:performance|weights))\b/i.test(raw)) {
    const calibration = index?.model;
    if (!calibration || !calibration.evaluatedGames) {
      return { ok: true, intent: "league_scout",
        reply: "BallerWatch uses provisional, precomputed scouting estimates. A next-season validation sample is not yet available for this index.",
        sources: SOURCE };
    }
    const lines = [
      "Scouting model: " + (calibration.status === "tuned" ? "forward-validated tuned weights" : "conservative baseline retained"),
      "Forward validation: " + calibration.evaluatedGames + " scored fixtures across " +
        calibration.trainedFolds + " completed season folds.",
      "Multiclass Brier (lower is better): " +
        calibration.nextSeasonBrier + " with walk-forward selection vs " +
        calibration.baselineNextSeasonBrier + " baseline.",
      calibration.qualityNextSeasonCorrelation == null
        ? "Quality-score correlation: not enough comparable team-seasons."
        : "Previous-season opponent-adjusted quality vs next-season performance correlation: " +
          calibration.qualityNextSeasonCorrelation + " (" +
          calibration.qualityTeamPairs + " comparable team-seasons).",
      "Each test uses only prior completed seasons. No match outcome can train its own prediction. "
        + "These numbers are not calibrated betting odds.",
    ];
    return { ok: true, reply: lines.join("\n"), intent: "league_scout", sources: SOURCE };
  }
  const candidates = reportRows(index);
  const matchups = Object.values(index?.standings?.matchups || {})
    .filter((match) => match?.team && match?.opponent);
  const mentioned = [...new Map(candidates.filter((row) => containsName(raw, row.team))
    .map((row) => [key(row.team), row.team])).values()]
    .sort((a, b) => b.length - a.length);
  // Context is only reused for an explicit follow-up. "Next matchup" must
  // not inherit the unrelated team from an earlier historical query.
  const contextualFollowup = /\b(?:their|they|them|that team|this team|same team|its|those teams|what about)\b/i.test(raw) &&
    !/\b(?:next|upcoming)\b/i.test(raw);
  const names = mentioned.length ? mentioned : contextualFollowup
    ? (Array.isArray(contextTeams) ? contextTeams : [])
      .map(String).filter((name) => candidates.some((row) => key(row.team) === key(name)))
      .slice(0, 2)
    : [];
  const namedMatchups = matchups.filter((match) =>
    containsName(raw, match.team) && containsName(raw, match.opponent));
  const wantsChance = /\b(?:win|chance|probability|odds|predict|likely|matchup|head.to.head)\b/i.test(raw);
  if (wantsChance && namedMatchups.length === 1) {
    return { ok: true, reply: matchupAnswer(namedMatchups[0]), intent: "league_scout",
      historyTeams: [namedMatchups[0].team, namedMatchups[0].opponent], sources: SOURCE };
  }
  const selected = [];
  for (const name of names.slice(0, 2)) {
    const result = selectReport(candidates, raw, name);
    if (result.ambiguity) {
      return { ok: false, error: "Several " + name +
        " rosters exist. Specify the division: " + result.ambiguity.join(" · ") + ".",
        intent: "league_scout" };
    }
    if (result.choice) selected.push(result.choice);
  }
  if (selected.length === 2) {
    const first = selected[0], second = selected[1];
    const lines = [scoutingSummary(first), "", scoutingSummary(second)];
    const match = matchups.find((item) =>
      key(item.team) === key(first.team) && key(item.opponent) === key(second.team));
    if (match && wantsChance) lines.push("", matchupAnswer(match));
    else if (wantsChance) lines.push("No prepared prediction for these teams. Form scores are not calibrated odds.");
    return { ok: true, reply: lines.join("\n"), intent: "league_scout",
      historyTeams: [first.team, second.team], sources: SOURCE };
  }
  if (selected.length === 1) {
    const team = selected[0];
    const match = matchups.find((item) => key(item.team) === key(team.team));
    const reply = scoutingSummary(team) + (wantsChance
      ? match ? "\n\n" + matchupAnswer(match)
        : "\nNo prepared prediction for this team's next opponent."
      : "");
    return { ok: true, reply, intent: "league_scout", historyTeams: [team.team], sources: SOURCE };
  }
  if (wantsChance && namedMatchups.length === 0 && matchups.length === 1 &&
      /\b(?:next|upcoming)\b/i.test(raw)) {
    const match = matchups[0];
    return { ok: true, reply: matchupAnswer(match), intent: "league_scout",
      historyTeams: [match.team, match.opponent], sources: SOURCE };
  }
  return { ok: false,
    error: "Name a team from League Standings, or ask about a monitored matchup. Scouting data is prepared hourly; missing predictions are not invented.",
    intent: "league_scout" };
}
