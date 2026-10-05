import test from "node:test";
import assert from "node:assert/strict";
import { checkScheduler, SCHEDULER_AUDIT_MS } from "../../../backend/watchdog/scheduler-check.mjs";
import { EXTERNAL_SCHEDULE_SPECS } from "../../../backend/infra/external-schedules.mjs";

const now = Date.parse("2026-10-01T00:00:00Z");
const jobs = EXTERNAL_SCHEDULE_SPECS.map(spec => ({ title: spec.title, enabled: true, schedule: { minutes: spec.minutes }, url: `https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/${spec.workflow}/dispatches` }));

test("10-minute watchdog calls make at most 4 scheduler requests per day", async () => {
  let previous;
  let calls = 0;
  for (let i = 0; i < 144; i++) {
    previous = await checkScheduler(previous, { now: now + i * 600000, list: async () => { calls++; return jobs; } });
    assert.deepEqual(previous.problems, []);
  }
  assert.equal(calls, 4);
});

test("429 stays unhealthy during backoff; fresh successful audit recovers", async () => {
  const failed = await checkScheduler(null, { now, list: async () => { throw new Error("429"); } });
  assert.equal(failed.problems.length, 1);
  assert.equal(await checkScheduler(failed, { now: now + 600000, list: async () => { throw new Error("Must not call"); } }), failed);
  assert.deepEqual((await checkScheduler(failed, { now: now + SCHEDULER_AUDIT_MS, list: async () => jobs })).problems, []);
});

test("disabled or missing schedules are never cached as healthy", async () => {
  assert.ok((await checkScheduler(null, { now, list: async () => [] })).problems.length);
  assert.ok((await checkScheduler(null, { now, list: async () => jobs.map(j => ({ ...j, enabled: false })) })).problems.length);
});
