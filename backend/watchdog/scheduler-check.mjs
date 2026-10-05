/**
 * v2.5.0: bounds recurring scheduler audits to 4 calls/day within the 100/day API quota.
 * Cached results (including failures) live inside encrypted watchdog state. Release smoke
 * always checks live; missing, expired or invalid audit records never imply health.
 */
import { analyzeExternalSchedules, listExternalSchedules } from "../infra/external-schedules.mjs";

export const SCHEDULER_AUDIT_MS = 6 * 60 * 60 * 1000;

export async function checkScheduler(previous, { now = Date.now(), list = listExternalSchedules, repo = process.env.GITHUB_REPOSITORY || "vudh1/ballerwatch" } = {}) {
  const age = now - Date.parse(previous?.checkedAt || "");
  if (Number.isFinite(age) && age >= 0 && age < SCHEDULER_AUDIT_MS && Array.isArray(previous?.problems)) {
    return previous;
  }
  let problems;
  try {
    const jobs = await list();
    problems = analyzeExternalSchedules(jobs, { repo, expectEnabled: true, requireAll: true })
      .map((message, index) => ({ key: `external-cron:${index}:${message}`, message: `cron-job.org scheduler: ${message}` }));
  } catch {
    problems = [{ key: "external-cron:unreachable", message: "cron-job.org scheduler: unable to verify jobs; retrying at the next scheduler audit." }];
  }
  return { checkedAt: new Date(now).toISOString(), problems };
}
