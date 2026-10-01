import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTERNAL_SCHEDULE_SPECS,
  analyzeExternalSchedules,
  syncExternalSchedulesOptional,
  verifyExternalSchedules,
} from "../../infra/external-schedules.mjs";

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

test("enabled legacy Telegram polling schedule is reported", () => {
  const jobs = [
    ...EXTERNAL_SCHEDULE_SPECS.map((spec) => job(spec, true)),
    {
      title: "BallerWatch - Telegram listener",
      enabled: true,
      url: "https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/listener.yml/dispatches",
    },
  ];
  const problems = analyzeExternalSchedules(jobs, { expectEnabled: true });
  assert.ok(problems.some((problem) => problem.includes("legacy polling job must stay disabled")));
});

test("enabled state can still be ignored when only structure matters", () => {
  const jobs = EXTERNAL_SCHEDULE_SPECS.map((spec) => job(spec, true));
  const problems = analyzeExternalSchedules(jobs, { expectEnabled: null });
  assert.deepEqual(problems, []);
});

test("optional release verification tolerates a temporary 429", async () => {
  const result = await verifyExternalSchedules({
    optionalUnavailable: true,
    list: async () => { throw new Error("cron-job.org GET /jobs failed (429)"); },
  });
  assert.equal(result.available, false);
  assert.deepEqual(result.problems, []);
  assert.match(result.warning, /429/);
});

test("optional release verification still fails on bad credentials", async () => {
  await assert.rejects(
    verifyExternalSchedules({
      optionalUnavailable: true,
      list: async () => { throw new Error("cron-job.org GET /jobs failed (401)"); },
    }),
    /401/,
  );
});

test("optional release verification still reports a verified bad scheduler posture", async () => {
  const result = await verifyExternalSchedules({
    optionalUnavailable: true,
    list: async () => [],
  });
  assert.equal(result.available, true);
  assert.ok(result.problems.some((problem) => problem.includes("scheduled job is missing")));
});

test("optional scheduler synchronization tolerates temporary quota exhaustion", async () => {
  const result = await syncExternalSchedulesOptional(
    "ensure-enabled",
    {},
    async () => { throw new Error("cron-job.org GET /jobs failed (429)"); },
  );
  assert.equal(result.available, false);
  assert.match(result.warning, /429/);
});

test("optional scheduler synchronization still fails on auth errors", async () => {
  await assert.rejects(
    syncExternalSchedulesOptional(
      "ensure-enabled",
      {},
      async () => { throw new Error("cron-job.org GET /jobs failed (401)"); },
    ),
    /401/,
  );
});
