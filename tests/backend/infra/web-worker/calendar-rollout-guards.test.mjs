/**
 * Calendar rollout guardrails: no implicit D1, billed provider or production
 * deployment is introduced by a source-only compatibility change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("default Worker configuration has no D1, KV or Cloudflare Cron Trigger", () => {
  const config = JSON.parse(source("../../../../backend/infra/web-worker/wrangler.jsonc"));
  assert.equal(config.name, "ballerwatch-web");
  assert.deepEqual(config.triggers?.crons, []);
  assert.equal(Object.hasOwn(config, "d1_databases"), false);
  assert.equal(Object.hasOwn(config, "kv_namespaces"), false);
});

test("D1 is opt-in only, and the existing release gate never provisions a database", () => {
  const prepare = source("../../../../backend/infra/web-worker/prepare-config.mjs");
  const worker = source("../../../../.github/workflows/deploy-worker.yml");
  const promotion = source("../../../../.github/workflows/promote-release.yml");
  assert.match(prepare, /process\.env\.CALENDAR_D1_DATABASE_ID/);
  assert.match(prepare, /if \(databaseId\)/);
  assert.match(prepare, /binding: "CALENDAR_PROFILES"/);
  assert.match(worker, /CALENDAR_D1_DATABASE_ID.*\$\{\{ secrets\.CALENDAR_D1_DATABASE_ID \}\}/);
  assert.match(worker, /CALENDAR_SYNC_KEY.*\$\{\{ secrets\.CALENDAR_SYNC_KEY \}\}/);
  assert.match(worker, /calendar D1 database and encryption key must be configured together/i);
  assert.match(worker, /if \[ -n "\$CALENDAR_D1_DATABASE_ID" \]; then/);
  assert.doesNotMatch(worker, /wrangler\S*\s+d1\s+create\b/i);
  assert.match(worker, /release:\s*\n\s*types: \[published\]/);
  assert.match(promotion, /workflow_dispatch:/);
  assert.doesNotMatch(promotion, /\n\s+push:\s*\n/);
});

test("legacy parameterized ICS and new profile feed share the source formatter", () => {
  const worker = source("../../../../backend/infra/web-worker/worker.mjs");
  assert.match(worker, /url\.pathname === "\/web\/calendar\.ics"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/web\/v1\/calendar-"\)/);
  assert.match(worker, /handleCalendarProfileRequest\(request, env,/);
  assert.match(worker, /calendarSelectionIcs\(env, selection\)/);
  assert.match(worker, /calendarSelectionIcs\(env, \{ teams, watch: watches, pickup \}\)/);
});
