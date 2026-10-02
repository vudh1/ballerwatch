/**
 * Manages cron-job.org primary GitHub schedules and validates their target/cadence posture.
 *
 * Documentation baseline: v5.7.0. Primary scheduler sync targets the promoted production branch, disables legacy Telegram polling/watchdog schedules when possible, and treats temporary scheduler-API outages as optional only in deployment flows.
 */
const API = "https://api.cron-job.org";

const allMinutes = (step) =>
  Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).filter((v) => v < 60);

export const EXTERNAL_SCHEDULE_SPECS = Object.freeze([
  { title: "BallerWatch - Pickup watcher", workflow: "pickup.yml", minutes: allMinutes(2), hours: [-1] },
  { title: "BallerWatch - League watcher", workflow: "league.yml", minutes: allMinutes(5), hours: [-1] },
]);

export const RETIRED_EXTERNAL_SCHEDULE_SPECS = Object.freeze([
  { title: "BallerWatch - System watchdog", workflow: "watchdog.yml" },
]);

function normalizeMinutes(value) {
  return Array.isArray(value)
    ? value.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    : [];
}

function sameNumbers(a, b) {
  return JSON.stringify(normalizeMinutes(a)) === JSON.stringify(normalizeMinutes(b));
}

function retiredExternalJobs(jobs, repo) {
  return (Array.isArray(jobs) ? jobs : []).filter((job) =>
    RETIRED_EXTERNAL_SCHEDULE_SPECS.some((spec) =>
      job?.title === spec.title ||
      String(job?.url || "").includes("/repos/" + repo + "/actions/workflows/" + spec.workflow + "/dispatches")
    )
  );
}

function legacyListenerJobs(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter((job) =>
    job?.title === "BallerWatch - Telegram listener" ||
    String(job?.url || "").includes("/actions/workflows/listener.yml/dispatches")
  );
}

function jobMatchesSpec(job, spec, repo) {
  const url = String(job?.url || "");
  return (
    job?.title === spec.title ||
    url.includes(`/repos/${repo}/actions/workflows/${spec.workflow}/dispatches`)
  );
}

export function analyzeExternalSchedules(jobs, {
  repo = "vudh1/ballerwatch",
  expectEnabled = true,
  requireAll = true,
} = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const problems = [];

  for (const spec of EXTERNAL_SCHEDULE_SPECS) {
    const matches = list.filter((job) => jobMatchesSpec(job, spec, repo));
    if (!matches.length) {
      if (requireAll) problems.push(`${spec.title}: scheduled job is missing`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`${spec.title}: duplicate scheduled jobs exist`);
    }

    const job = matches[0];
    if (expectEnabled !== null && Boolean(job.enabled) !== Boolean(expectEnabled)) {
      problems.push(
        `${spec.title}: expected ${expectEnabled ? "enabled" : "disabled"} but is ${job.enabled ? "enabled" : "disabled"}`,
      );
    }

    const minutes = job?.schedule?.minutes;
    if (Array.isArray(minutes) && !sameNumbers(minutes, spec.minutes)) {
      problems.push(`${spec.title}: minute cadence does not match the expected schedule`);
    }
    const hours = job?.schedule?.hours;
    if (Array.isArray(hours) && !sameNumbers(hours, spec.hours || [-1])) {
      problems.push(`${spec.title}: hour cadence does not match the expected schedule`);
    }

    const expectedUrl = `/repos/${repo}/actions/workflows/${spec.workflow}/dispatches`;
    if (job?.url && !String(job.url).includes(expectedUrl)) {
      problems.push(`${spec.title}: schedule target is not ${spec.workflow}`);
    }
  }

  const listenerJobs = legacyListenerJobs(list);
  if (listenerJobs.some((job) => job.enabled)) {
    problems.push("BallerWatch - Telegram listener: legacy polling job must stay disabled");
  }
  const retiredJobs = retiredExternalJobs(list, repo);
  if (retiredJobs.some((job) => job.enabled)) {
    problems.push("BallerWatch - System watchdog: retired cron-job.org schedule must stay disabled");
  }

  return problems;
}

async function cronCall(apiKey, path, { method = "GET", body } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const wait = /^\d+$/.test(retry || "") ? `; retry after ${retry}s` : "";
    throw new Error(`cron-job.org ${method} ${path} failed (${response.status})${wait}`);
  }
  return data;
}

export async function listExternalSchedules(apiKey = process.env.CRON_JOB_ORG_API_KEY || "") {
  if (!apiKey) throw new Error("CRON_JOB_ORG_API_KEY is required");
  const data = await cronCall(apiKey, "/jobs");
  if (data.someFailed) throw new Error("cron-job.org returned an incomplete job list");
  return Array.isArray(data.jobs) ? data.jobs : [];
}

export function isTemporarySchedulerApiError(error) {
  const message = String(error?.message || error || "");
  return /\b429\b|\b50[234]\b|fetch failed|timed? ?out|timeout|ECONN|ENET|EAI_AGAIN/i.test(message);
}

export async function verifyExternalSchedules({
  apiKey = process.env.CRON_JOB_ORG_API_KEY || "",
  repo = process.env.GITHUB_REPOSITORY || "vudh1/ballerwatch",
  expectEnabled = true,
  optionalUnavailable = false,
  list = listExternalSchedules,
} = {}) {
  let jobs;
  try {
    jobs = await list(apiKey);
  } catch (error) {
    if (optionalUnavailable && isTemporarySchedulerApiError(error)) {
      return {
        available: false,
        problems: [],
        warning: `cron-job.org scheduler verification temporarily unavailable: ${error.message}`,
      };
    }
    throw error;
  }

  return {
    available: true,
    problems: analyzeExternalSchedules(jobs, { repo, expectEnabled, requireAll: true }),
    warning: null,
  };
}

function desiredJob(spec, { repo, branch, githubPat, enabled }) {
  return {
    enabled,
    title: spec.title,
    saveResponses: false,
    url: `https://api.github.com/repos/${repo}/actions/workflows/${spec.workflow}/dispatches`,
    requestMethod: 1,
    requestTimeout: 30,
    redirectSuccess: false,
    schedule: {
      timezone: "UTC",
      expiresAt: 0,
      hours: spec.hours || [-1],
      mdays: [-1],
      minutes: spec.minutes,
      months: [-1],
      wdays: [-1],
    },
    notification: {
      onFailure: true,
      onFailureCount: 1,
      onSuccess: true,
      onDisable: true,
      onSslCertExpiry: false,
      mode: 1,
    },
    extendedData: {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubPat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: branch }),
    },
  };
}

export async function syncExternalSchedulesOptional(mode, options = {}, sync = syncExternalSchedules) {
  try {
    await sync(mode, options);
    return { available: true, warning: null };
  } catch (error) {
    if (!isTemporarySchedulerApiError(error)) throw error;
    return {
      available: false,
      warning: `cron-job.org scheduler synchronization temporarily unavailable: ${error.message}`,
    };
  }
}

export async function syncExternalSchedules(mode, {
  apiKey = process.env.CRON_JOB_ORG_API_KEY || "",
  githubPat = process.env.CRON_GITHUB_PAT || "",
  repo = process.env.GITHUB_REPOSITORY || "vudh1/ballerwatch",
  branch = process.env.BALLERWATCH_BRANCH || "production",
} = {}) {
  if (!apiKey) throw new Error("CRON_JOB_ORG_API_KEY is required");
  if (!["enable", "disable", "ensure-enabled", "ensure-disabled"].includes(mode)) {
    throw new Error("Mode must be enable, disable, ensure-enabled, or ensure-disabled");
  }

  const jobs = await listExternalSchedules(apiKey);

  if (mode === "disable") {
    const recognized = jobs.filter((job) =>
      EXTERNAL_SCHEDULE_SPECS.some((spec) => jobMatchesSpec(job, spec, repo)) ||
      retiredExternalJobs([job], repo).length > 0 ||
      legacyListenerJobs([job]).length > 0
    );
    for (const job of recognized.filter((job) => job.enabled)) {
      await cronCall(apiKey, `/jobs/${job.jobId}`, {
        method: "PATCH",
        body: { job: { enabled: false } },
      });
      console.log(`Disabled external schedule ${job.jobId} (${job.title || "untitled"}).`);
    }
    if (!recognized.some((job) => job.enabled)) {
      console.log("No enabled BallerWatch external schedules found.");
    }
    return;
  }

  if (!githubPat) throw new Error("CRON_GITHUB_PAT is required");

  if (mode === "enable" || mode === "ensure-enabled") {
    for (const job of legacyListenerJobs(jobs).filter((item) => item.enabled)) {
      await cronCall(apiKey, `/jobs/${job.jobId}`, {
        method: "PATCH",
        body: { job: { enabled: false } },
      });
      console.log(`Disabled legacy Telegram polling schedule ${job.jobId}.`);
    }
    for (const job of retiredExternalJobs(jobs, repo).filter((item) => item.enabled)) {
      await cronCall(apiKey, `/jobs/${job.jobId}`, {
        method: "PATCH",
        body: { job: { enabled: false } },
      });
      console.log(`Disabled retired external schedule ${job.jobId} (${job.title || "watchdog"}).`);
    }
  }

  const enabled = mode === "enable" || mode === "ensure-enabled";
  for (const spec of EXTERNAL_SCHEDULE_SPECS) {
    const next = desiredJob(spec, { repo, branch, githubPat, enabled });
    const existing = jobs.find((job) => jobMatchesSpec(job, spec, repo));
    if (existing) {
      await cronCall(apiKey, `/jobs/${existing.jobId}`, {
        method: "PATCH",
        body: { job: next },
      });
      console.log(`${enabled ? "Enabled" : "Prepared disabled"} schedule ${spec.title} (${existing.jobId}).`);
    } else {
      const created = await cronCall(apiKey, "/jobs", {
        method: "PUT",
        body: { job: next },
      });
      console.log(`Created ${enabled ? "enabled" : "disabled"} schedule ${spec.title} (${created.jobId || "new"}).`);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
}

const isCli = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  const mode = process.argv[2] || "";
  if (mode === "ensure-enabled-optional") {
    const result = await syncExternalSchedulesOptional("ensure-enabled");
    if (!result.available) console.warn(`::warning::${result.warning}`);
  } else if (["check-enabled", "check-enabled-optional", "check-disabled"].includes(mode)) {
    const expectEnabled = mode !== "check-disabled";
    const result = await verifyExternalSchedules({
      expectEnabled,
      optionalUnavailable: mode === "check-enabled-optional",
    });
    if (!result.available) {
      console.warn(`::warning::${result.warning}`);
    } else if (result.problems.length) {
      for (const problem of result.problems) console.error(problem);
      process.exitCode = 1;
    } else {
      console.log(
        `All required cron-job.org scheduled jobs exist, have the expected cadence, and are ${expectEnabled ? "enabled" : "disabled"}; retired listener/watchdog jobs are disabled.`,
      );
    }
  } else {
    await syncExternalSchedules(mode);
  }
}
