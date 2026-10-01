import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTERNAL_SCHEDULE_SPECS,
  analyzeExternalSchedules,
} from "./external-schedules.mjs";

function job(spec, enabled = false) {
  return {
    title: spec.title,
    enabled,
    url: `https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/${spec.workflow}/dispatches`,
    schedule: { minutes: spec.minutes },
  };
}

test("healthy fallback posture has three disabled jobs", () => {
  const problems = analyzeExternalSchedules(EXTERNAL_SCHEDULE_SPECS.map((spec) => job(spec)), {
    expectEnabled: false,
  });
  assert.deepEqual(problems, []);
});

test("missing fallback job is reported", () => {
  const problems = analyzeExternalSchedules(EXTERNAL_SCHEDULE_SPECS.slice(0, 2).map((spec) => job(spec)), {
    expectEnabled: false,
  });
  assert.equal(problems.some((x) => x.includes("System watchdog") && x.includes("missing")), true);
});

test("enabled fallback is reported while edge is healthy", () => {
  const jobs = EXTERNAL_SCHEDULE_SPECS.map((spec, i) => job(spec, i === 0));
  const problems = analyzeExternalSchedules(jobs, { expectEnabled: false });
  assert.equal(problems.some((x) => x.includes("Pickup watcher") && x.includes("expected disabled")), true);
});

test("enabled state can be ignored while edge is unhealthy", () => {
  const jobs = EXTERNAL_SCHEDULE_SPECS.map((spec) => job(spec, true));
  const problems = analyzeExternalSchedules(jobs, { expectEnabled: null });
  assert.deepEqual(problems, []);
});
