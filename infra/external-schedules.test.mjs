import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTERNAL_SCHEDULE_SPECS,
  analyzeExternalSchedules,
} from "./external-schedules.mjs";

function job(spec, enabled = true) {
  return {
    title: spec.title,
    enabled,
    url: `https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/${spec.workflow}/dispatches`,
    schedule: { minutes: spec.minutes },
  };
}

test("healthy fallback posture has three enabled jobs", () => {
  const problems = analyzeExternalSchedules(EXTERNAL_SCHEDULE_SPECS.map((spec) => job(spec)), {
    expectEnabled: true,
  });
  assert.deepEqual(problems, []);
});

test("missing fallback job is reported", () => {
  const problems = analyzeExternalSchedules(EXTERNAL_SCHEDULE_SPECS.slice(0, 2).map((spec) => job(spec)), {
    expectEnabled: false,
  });
  assert.equal(problems.some((x) => x.includes("System watchdog") && x.includes("missing")), true);
});

test("disabled fallback is reported", () => {
  const jobs = EXTERNAL_SCHEDULE_SPECS.map((spec, i) => job(spec, i !== 0));
  const problems = analyzeExternalSchedules(jobs, { expectEnabled: true });
  assert.equal(
    problems.some((x) => x.includes("Pickup watcher") && x.includes("expected enabled")),
    true,
  );
});

test("enabled state can still be ignored when only structure matters", () => {
  const jobs = EXTERNAL_SCHEDULE_SPECS.map((spec) => job(spec, true));
  const problems = analyzeExternalSchedules(jobs, { expectEnabled: null });
  assert.deepEqual(problems, []);
});
