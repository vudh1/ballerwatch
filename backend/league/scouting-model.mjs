/**
 * v9.1.0: weekly dual-provider proposals and independently scored model gates.
 * Only aggregate metrics leave Actions; raw history stays in memory. Eligible
 * weights are written in a complete AES-GCM envelope, never source commits.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { aiProviders, requestAiJson } from "../shared/ai-provider.mjs";
import { validGoalConfig } from "../shared/scout-goals.mjs";
import { PRODUCTION_SCOUT_WEIGHTS } from "../shared/scout-calibration.mjs";
import { evaluateArchive } from "./scouting-evaluation.mjs";

export const SCOUT_MODEL_FILE = "league/state/scout-model.json";
export async function proposeGoalConfigs(evaluation, env, request = requestAiJson) {
  const aggregate = Object.fromEntries(Object.entries(evaluation.comparisons).map(([name, metrics]) =>
    [name, { config: evaluation.challengerConfigs?.[name]?.goals || null, development: metrics.development && {
      n: metrics.development.n, logLoss: metrics.development.logLoss,
      brier: metrics.development.brier, actualDrawPct: metrics.development.actualDrawPct,
    } }]));
  const proposals = [];
  for (const provider of aiProviders(env)) {
    const output = await request(provider, env, {
      system: 'Propose up to three regularized goal-rate ensemble settings to benchmark, not predictions. Return JSON {"candidates":[{"blend":0.2,"prior":6,"decay":0.94}]}. Allowed blend:0.2,0.4,0.6; prior:3,6,10; decay:0.9,0.94,0.98. Consider conservative alternatives. No other output.',
      user: JSON.stringify(aggregate), tokens: 500, timeoutMs: 20000,
    });
    for (const candidate of (Array.isArray(output?.candidates) ? output.candidates : []).slice(0, 3)) {
      const config = validGoalConfig(candidate);
      if (config) proposals.push(config);
    }
  }
  return proposals;
}
export function modelFromEvaluation(evaluation, seasonId, now = new Date()) {
  const eligible = evaluation.productionPromotionRecommended === true;
  const heldout = evaluation.comparisons[eligible ? evaluation.selectedModel : "champion-production"]?.holdout;
  return {
    schemaVersion: 1, seasonId, generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 8 * 86400000).toISOString(),
    status: eligible ? "holdout-gated-ensemble" : "production-locked",
    weights: eligible ? evaluation.selectedWeights : { ...PRODUCTION_SCOUT_WEIGHTS },
    holdoutSeason: evaluation.holdoutSeason, holdoutGames: heldout?.n || 0,
    holdoutLogLoss: heldout?.logLoss ?? null, holdoutBrier: heldout?.brier ?? null,
    baselineHoldoutLogLoss: evaluation.comparisons["champion-production"]?.holdout?.logLoss ?? null,
    pairedDateGroups: evaluation.pairedDateGroups,
    pairedLogLossLift95Lower: evaluation.pairedLogLossLift95Lower,
    selectedModel: evaluation.selectedModel,
    gateReason: evaluation.productionPromotionBlockedReason,
  };
}
export function usableModel(model, seasonId, now = new Date()) {
  return model?.schemaVersion === 1 && model.seasonId === seasonId &&
    new Date(model.generatedAt).getTime() <= now.getTime() &&
    new Date(model.expiresAt).getTime() > now.getTime() &&
    model.status === "holdout-gated-ensemble" && validGoalConfig(model.weights?.goals) &&
    Object.entries(PRODUCTION_SCOUT_WEIGHTS).every(([key, value]) => model.weights[key] === value) &&
    model.holdoutGames >= 100 && model.pairedDateGroups >= 12 && model.pairedLogLossLift95Lower > 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const history = decryptState(JSON.parse(fs.readFileSync("league/state/history.json", "utf8")));
  const league = decryptState(JSON.parse(fs.readFileSync("league/state/schedule.json", "utf8")));
  const initial = evaluateArchive(history, league.seasonId);
  const proposals = await proposeGoalConfigs(initial, process.env);
  const result = proposals.length ? evaluateArchive(history, league.seasonId, proposals) : initial;
  const model = modelFromEvaluation(result, league.seasonId);
  fs.writeFileSync(SCOUT_MODEL_FILE, JSON.stringify(encryptState(model), null, 2) + "\n");
  // Only aggregate metrics, never provider responses, prompts or match rows.
  console.log(JSON.stringify({ status: model.status, holdout: model.holdoutSeason,
    games: model.holdoutGames, logLoss: model.holdoutLogLoss, brier: model.holdoutBrier,
    lowerLift: model.pairedLogLossLift95Lower, providerProposals: proposals.length }));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Scouting model\n\n${model.status}; holdout ${model.holdoutSeason}, ${model.holdoutGames} games. Log loss ${model.holdoutLogLoss}; Brier ${model.holdoutBrier}.\n`);
}
