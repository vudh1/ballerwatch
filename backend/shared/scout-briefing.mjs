/**
 * v9.1.0: evidence-led scouting briefings from prepared public team statistics.
 * AI may rank allowed fact IDs only; displayed words/numbers remain deterministic.
 * No names, rosters, settings or chat text are sent to either provider.
 */
import { aiProviders, requestAiJson } from "./ai-provider.mjs";

export function briefingFacts(scout) {
  const facts = [];
  const add = (id, text) => facts.push({ id, text });
  const recent = (scout?.recent || []).slice(0, 5);
  if (recent.length) {
    const count = (result) => recent.filter((match) => match.result === result).length;
    add("form", `Last ${recent.length} indexed results: ${count("W")} wins, ${count("D")} draws, ${count("L")} losses.`);
  }
  if (Number.isFinite(scout?.attack?.perGame)) {
    add("attack", `Recent scoring: ${scout.attack.perGame} goals/game over ${scout.attack.games} scored matches; division rank ${scout.attack.rank} of ${scout.attack.total}.`);
    if (scout.attack.rank <= Math.ceil(scout.attack.total / 3) && scout.attack.games >= 5) {
      add("plan-attack", "Preparation: their recent scoring ranks in the top third of this division. Rehearse defensive transitions; results alone do not identify their formation or players.");
    }
  }
  if (Number.isFinite(scout?.defense?.perGame)) {
    add("defense", `Recent defending: ${scout.defense.perGame} goals allowed/game over ${scout.defense.games} scored matches; division rank ${scout.defense.rank} of ${scout.defense.total}.`);
    if (scout.defense.rank > scout.defense.total * 2 / 3 && scout.defense.games >= 5) {
      add("plan-defense", "Preparation: their recent defensive record ranks in the bottom third. Plan to create repeat chances; this does not establish a specific tactical weakness.");
    }
  }
  const games = scout?.recentTen?.games || 0;
  add("sample", `Evidence window: ${games} recent scored games. ${games < 5 ? "Thin sample: use extra caution." : "Past results do not capture lineup, injuries or availability."}`);
  if (!scout?.archiveComplete) add("coverage", "Archive coverage is partial; absent games are not treated as draws or losses.");
  return facts;
}
export function applyBriefing(scout, ids = []) {
  const facts = briefingFacts(scout);
  const requested = new Set(ids);
  const selected = facts.filter((fact) => requested.has(fact.id));
  // Evidence limits always stay visible, even when providers omit them.
  const chosen = selected.length ? selected : facts.filter((fact) => !fact.id.startsWith("plan-"));
  return [...chosen, ...facts.filter((fact) => ["sample", "coverage"].includes(fact.id) &&
    !chosen.includes(fact))].map((fact) => fact.text);
}
export async function rankBriefingFacts(reports, env, request = requestAiJson) {
  const providers = aiProviders(env);
  if (providers.length < 2) return {};
  const input = Object.entries(reports).slice(0, 12).map(([id, report], index) => ({
    id: String(index), facts: briefingFacts(report.scout), sourceId: id,
  }));
  const user = JSON.stringify(input.map(({ sourceId, ...entry }) => entry));
  const system = 'Rank the most useful soccer scouting evidence, using only supplied facts. Return JSON {"reports":[{"id":"0","facts":["attack","form"]}]}. Select at most four existing fact IDs per report. Do not write prose, new facts, odds, names or tactics.';
  const outputs = [];
  for (const provider of providers) {
    const answer = await request(provider, env, { system, user, tokens: 1200, timeoutMs: 20000 });
    outputs.push(Array.isArray(answer?.reports) ? answer.reports : []);
  }
  const result = {};
  for (const item of input) {
    const choices = outputs.map((rows) => rows.find((row) => row?.id === item.id)?.facts);
    if (!choices.every((ids) => Array.isArray(ids) && ids.length <= 4 &&
      ids.every((id) => item.facts.some((fact) => fact.id === id)))) continue;
    const agreed = choices[0].filter((id) => choices[1].includes(id));
    if (agreed.length) result[item.sourceId] = [...new Set(agreed)];
  }
  return result;
}
