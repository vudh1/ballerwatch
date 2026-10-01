import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeWorkflowRuns,
  shouldDispatchRecovery,
} from "./watchdog.mjs";

const now = Date.parse("2026-10-01T12:00:00Z");
const spec = {
  file: "pickup.yml",
  label: "Pickup watcher",
  maxAgeMinutes: 7,
  activeGraceMinutes: 6,
};

function run(ageMinutes, status = "completed", conclusion = "success") {
  const time = new Date(now - ageMinutes * 60_000).toISOString();
  return {
    status,
    conclusion,
    created_at: time,
    updated_at: time,
  };
}

test("healthy successful workflow", () => {
  const result = analyzeWorkflowRuns([run(2)], spec, now);
  assert.equal(result.healthy, true);
  assert.equal(result.recoverable, false);
});

test("recent active workflow blocks recovery", () => {
  for (const status of ["queued", "in_progress"]) {
    const result = analyzeWorkflowRuns([run(2, status, null)], spec, now);
    assert.equal(result.healthy, true);
    assert.equal(result.active, true);
  }
});

test("stalled active workflow becomes recoverable", () => {
  const result = analyzeWorkflowRuns([run(8, "in_progress", null)], spec, now);
  assert.equal(result.healthy, false);
  assert.equal(result.recoverable, true);
  assert.equal(result.key, "pickup.yml:stalled");
});

test("failed latest run is recoverable", () => {
  const result = analyzeWorkflowRuns([
    run(1, "completed", "failure"),
    run(3),
  ], spec, now);
  assert.equal(result.healthy, false);
  assert.equal(result.key, "pickup.yml:failed");
});

test("stale success is recoverable", () => {
  const result = analyzeWorkflowRuns([run(9)], spec, now);
  assert.equal(result.healthy, false);
  assert.equal(result.key, "pickup.yml:stale");
});

test("missing runs are recoverable", () => {
  const result = analyzeWorkflowRuns([], spec, now);
  assert.equal(result.healthy, false);
  assert.equal(result.key, "pickup.yml:no-runs");
});

test("recovery cooldown is ten minutes", () => {
  assert.equal(shouldDispatchRecovery("", now), true);
  assert.equal(
    shouldDispatchRecovery(new Date(now - 11 * 60_000).toISOString(), now),
    true,
  );
  assert.equal(
    shouldDispatchRecovery(new Date(now - 5 * 60_000).toISOString(), now),
    false,
  );
});
