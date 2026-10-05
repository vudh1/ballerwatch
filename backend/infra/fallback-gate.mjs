/**
 * Health gate for cron-job.org fallback dispatches.
 *
 * Documentation baseline: v2.3.0. A healthy edge heartbeat skips duplicate source work;
 * an unavailable or stale edge allows the GitHub fallback workflow to proceed.
 */
const DEFAULT_HEALTH_URL = "https://ballerwatch-web.vudhone.workers.dev/health";

const THRESHOLDS = Object.freeze({
  pickup: 6,
  league: 12,
});

export function evaluateFallback(component, health) {
  const threshold = THRESHOLDS[component];
  if (!threshold) return { shouldRun: true, reason: "component-not-gated" };
  if (!health || health.ok !== true || health.kv !== true) {
    return { shouldRun: true, reason: "edge-unavailable" };
  }

  const age = Number(health[`${component}AgeMinutes`]);
  if (!Number.isFinite(age) || age > threshold) {
    return { shouldRun: true, reason: "edge-heartbeat-stale" };
  }
  return { shouldRun: false, reason: "edge-healthy" };
}

export async function checkFallbackGate(component, {
  externalFallback = false,
  healthUrl = process.env.BALLERWATCH_WORKER_HEALTH_URL || DEFAULT_HEALTH_URL,
} = {}) {
  if (!externalFallback) return { shouldRun: true, reason: "primary-dispatch" };

  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
    const health = response.ok ? await response.json() : null;
    return evaluateFallback(component, health);
  } catch {
    return { shouldRun: true, reason: "edge-health-unreachable" };
  }
}

const isCli = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  const component = process.argv[2];
  const externalFallback = String(process.env.EXTERNAL_FALLBACK || "").toLowerCase() === "true";
  const result = await checkFallbackGate(component, { externalFallback });
  console.log(`Fallback gate: ${result.reason}; shouldRun=${result.shouldRun}`);
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import("node:fs");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `should_run=${result.shouldRun}\nreason=${result.reason}\n`);
  }
}
