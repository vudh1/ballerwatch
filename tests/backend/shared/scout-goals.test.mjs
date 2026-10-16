import test from "node:test";
import assert from "node:assert/strict";
import { goalForecast, blendGoalForecast, validGoalConfig } from "../../../backend/shared/scout-goals.mjs";
import { briefingFacts, applyBriefing, rankBriefingFacts } from "../../../backend/shared/scout-briefing.mjs";
import { modelFromEvaluation, usableModel, proposeGoalConfigs, modelRefreshDue } from "../../../backend/league/scouting-model.mjs";
import { PRODUCTION_SCOUT_WEIGHTS } from "../../../backend/shared/scout-calibration.mjs";
const config = { blend: 0.4, prior: 6, decay: 0.94 };
const strong = Array.from({ length: 10 }, () => ({ scored: 4, conceded: 1 }));
const weak = Array.from({ length: 10 }, () => ({ scored: 1, conceded: 4 }));
test("goal challenger is finite, normalized, reversible and neutral for missing data", () => {
  const first = goalForecast(strong, weak, config), second = goalForecast(weak, strong, config);
  assert.ok(first.win > first.loss);
  assert.ok(Math.abs(first.win + first.draw + first.loss - 1) < 1e-12);
  assert.ok(Math.abs(first.win - second.loss) < 1e-12);
  const base = { win: 0.4, draw: 0.2, loss: 0.4 };
  assert.deepEqual(blendGoalForecast(base, strong, [], config), base);
  assert.deepEqual(blendGoalForecast(base, strong, weak, { ...config, blend: 1 }), base);
  assert.equal(validGoalConfig({ ...config, prior: "6" }), null);
});
test("weekly promotion fails closed for expiry, new season and invalid configuration", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const evaluation = { productionPromotionRecommended: true, selectedModel: "goals-1",
    selectedWeights: { ...PRODUCTION_SCOUT_WEIGHTS, goals: config }, holdoutSeason: "summer-2026",
    pairedDateGroups: 18, pairedLogLossLift95Lower: 0.012,
    comparisons: { "goals-1": { holdout: { n: 150, logLoss: 0.9, brier: 0.5 } },
      "champion-production": { holdout: { logLoss: 0.95 } } } };
  const model = modelFromEvaluation(evaluation, "fall-2026", now);
  assert.ok(usableModel(model, "fall-2026", now));
  assert.ok(!usableModel(model, "winter-2027", now));
  assert.ok(!usableModel(model, "fall-2026", new Date("2026-10-25")));
  assert.ok(!usableModel({ ...model, pairedLogLossLift95Lower: 0 }, "fall-2026", now));
  assert.ok(!usableModel({ ...model, weights: { ...model.weights, form: 2 } }, "fall-2026", now));
  const retained = modelFromEvaluation({ ...evaluation, productionPromotionRecommended: false }, "fall-2026", now);
  assert.equal(retained.status, "production-locked");
  assert.ok(usableModel(retained, "fall-2026", now), "Publish fresh benchmark metadata when champion is retained");
  assert.ok(!usableModel({ ...retained, weights: { ...retained.weights, goals: config } }, "fall-2026", now));
});
test("both providers propose bounded settings from development aggregates only", async () => {
  const prompts = [];
  const result = await proposeGoalConfigs({ comparisons: { challenger: {
    development: { n: 300, logLoss: 0.9, brier: 0.5, actualDrawPct: 20 },
    holdout: { privateSentinel: "never transmit" },
  } } }, { GEMINI_API_KEY: "fake", GROQ_API_KEY: "fake" }, async (provider, env, prompt) => {
    prompts.push(prompt.user);
    return { candidates: [config, { ...config, prior: 1000 }, { blend: "0.4" }] };
  });
  assert.equal(result.length, 2);
  assert.equal(prompts.length, 2);
  assert.doesNotMatch(prompts.join(""), /holdout|never transmit|privateSentinel/);
});
test("briefings always retain evidence limits and discard ungrounded provider outputs", async () => {
  const scout = { recent: [{ result: "W" }, { result: "L" }], recentTen: { games: 2 },
    attack: { perGame: 2, games: 2, rank: 1, total: 8 }, archiveComplete: false };
  assert.ok(briefingFacts(scout).some((item) => item.id === "coverage"));
  assert.ok(applyBriefing(scout, ["invented"]).some((text) => text.includes("Thin sample")));
  const reports = { privateTeamSentinel: { scout } };
  const inputs = [];
  const ranked = await rankBriefingFacts(reports, { GEMINI_API_KEY: "fake", GROQ_API_KEY: "fake" }, async (provider, env, prompt) => {
    inputs.push(prompt.user);
    return { reports: [{ id: "0", facts: provider === "gemini" ? ["attack", "form"] : ["attack"] }] };
  });
  assert.deepEqual(ranked, { privateTeamSentinel: ["attack"] });
  assert.doesNotMatch(inputs.join(""), /privateTeamSentinel/);
  assert.deepEqual(await rankBriefingFacts(reports, { GEMINI_API_KEY: "fake", GROQ_API_KEY: "fake" }, async () =>
    ({ reports: [{ id: "0", facts: ["made-up"] }] })), {});
});

test("weekly model work is due within the hourly writer, including policy/season changes", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const current = { schemaVersion: 1, policyVersion: "9.1.1", seasonId: "fall-2026",
    generatedAt: now.toISOString(), expiresAt: "2026-10-24T12:00:00Z" };
  assert.equal(modelRefreshDue(current, "fall-2026", now), false);
  assert.equal(modelRefreshDue(current, "fall-2026", new Date("2026-10-23T12:00:00Z")), true);
  assert.equal(modelRefreshDue(current, "winter-2027", now), true);
  assert.equal(modelRefreshDue({ ...current, policyVersion: "old" }, "fall-2026", now), true);
  assert.equal(modelRefreshDue(null, "fall-2026", now), true);
});
