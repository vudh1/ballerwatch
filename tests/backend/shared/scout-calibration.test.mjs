import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCOUT_WEIGHTS, forecastFromFeatures, roundThreeWay,
  tuneScoutingWeights,
} from "../../../backend/shared/scout-calibration.mjs";

function seasons() {
  const ids = [
    "spring-2024", "summer-2024", "fall-2024", "winter-2025",
    "spring-2025", "summer-2025", "fall-2025", "winter-2026",
    "spring-2026", "summer-2026", "fall-2026",
  ];
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
  return ids.map((seasonId, seasonIndex) => {
    const [season, year] = seasonId.split("-");
    const month = { winter: 1, spring: 4, summer: 7, fall: 10 }[season];
    const matches = [];
    for (let i = 0; i < 48; i++) {
      const home = names[(i + seasonIndex) % names.length];
      const away = names[(i + seasonIndex + 1 + Math.floor(i / 6)) % names.length];
      if (home === away) continue;
      const date = String(year) + "-" + String(month + Math.floor(i / 20)).padStart(2, "0") +
        "-" + String(1 + i % 20).padStart(2, "0");
      const homeScore = (seasonIndex + i + 3) % 6;
      const awayScore = (seasonIndex * 3 + Math.floor(i / 2) + 1) % 5;
      matches.push({ date, homeTeam: home, awayTeam: away, homeScore, awayScore });
    }
    return {
      seasonId,
      label: seasonId,
      teams: names.map((name, rank) => ({
        name, division: rank < 3 ? "2a" : "2c",
        leagueName: "Tue Men's 11v11",
      })),
      matches,
    };
  });
}
function history() {
  return { updatedAt: "2026-10-12T12:00:00Z", seasons: seasons() };
}

test("probabilities are three-way, normalized and rounded to 5% steps", () => {
  const last = [{
    scored: 2, conceded: 1, tier: 1.3, format: "11v11",
  }, {
    scored: 3, conceded: 0, tier: 1.18, format: "8v8",
  }];
  const chance = forecastFromFeatures(last, [], [], DEFAULT_SCOUT_WEIGHTS);
  assert.ok(chance.win > chance.loss);
  assert.ok(Math.abs(chance.win + chance.draw + chance.loss - 1) < 1e-10);
  const pct = roundThreeWay(chance);
  assert.equal(pct.winPct + pct.drawPct + pct.lossPct, 100);
  assert.equal(pct.winPct % 5, 0);
  assert.equal(pct.drawPct % 5, 0);
  assert.equal(pct.lossPct % 5, 0);
});

test("walk forward freezes each season start and predicts the following season", () => {
  const calibration = tuneScoutingWeights(history(), "fall-2026");
  assert.equal(calibration.modelVersion, 1);
  assert.ok(calibration.archiveSeasons >= 8);
  assert.ok(calibration.evaluatedGames >= 80);
  assert.ok(calibration.trainedFolds >= 6);
  assert.ok(calibration.folds.some((f) => f.seasonId === "summer-2024"));
  assert.ok(calibration.folds.some((f) => f.seasonId === "fall-2024"));
  assert.equal(calibration.folds.some((f) => f.seasonId === "fall-2026"), false);
  assert.ok(Number.isFinite(calibration.baselineNextSeasonBrier));
  assert.ok(Number.isFinite(calibration.nextSeasonBrier));
  assert.ok(["tuned", "baseline-retained"].includes(calibration.status));
  assert.ok(calibration.weights.form > 0);
});

test("future/current scores cannot leak into weights or historical folds", () => {
  const source = history();
  const first = tuneScoutingWeights(source, "fall-2026");
  const modified = structuredClone(source);
  const current = modified.seasons.find((item) => item.seasonId === "fall-2026");
  current.matches.forEach((m) => {
    m.homeScore = 30;
    m.awayScore = 0;
  });
  const second = tuneScoutingWeights(modified, "fall-2026");
  assert.deepEqual(second, first);
  // A future season must be ignored even when present in an archive.
  modified.seasons.push({
    ...structuredClone(current),
    seasonId: "spring-2027",
  });
  const third = tuneScoutingWeights(modified, "fall-2026");
  assert.deepEqual(third, first);
});

test("less than two seasons of scores never overwrites production weights", () => {
  const data = { seasons: seasons().slice(0, 1) };
  const model = tuneScoutingWeights(data, "fall-2026");
  assert.equal(model.status, "baseline-retained");
  assert.deepEqual(model.weights, DEFAULT_SCOUT_WEIGHTS);
  assert.equal(model.evaluatedGames, 0);
});

test("seasonal regression reports are aggregate only without fixture/player names", () => {
  const model = tuneScoutingWeights(history(), "fall-2026");
  const serialized = JSON.stringify(model);
  assert.match(serialized, /baselineNextSeasonBrier/);
  assert.match(serialized, /qualityNextSeasonCorrelation/);
  assert.doesNotMatch(serialized, /Alpha|Bravo|Charlie|Delta|Foxtrot|homeTeam|awayTeam|players|RSVP/);
});
