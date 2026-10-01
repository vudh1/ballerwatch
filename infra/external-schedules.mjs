const API = "https://api.cron-job.org";

const allMinutes = (step) =>
  Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).filter((v) => v < 60);

export const EXTERNAL_SCHEDULE_SPECS = Object.freeze([
  { title: "BallerWatch - Pickup watcher", workflow: "pickup.yml", minutes: allMinutes(2) },
  { title: "BallerWatch - League watcher", workflow: "league.yml", minutes: allMinutes(5) },
  { title: "BallerWatch - System watchdog", workflow: "watchdog.yml", minutes: allMinutes(10) },
]);

function normalizeMinutes(value) {
  return Array.isArray(value)
    ? value.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    : [];
}

function sameNumbers(a, b) {
  return JSON.stringify(normalizeMinutes(a)) === JSON.stringify(normalizeMinutes(b));
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
  expectEnabled = false,
  requireAll = true,
} = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const problems = [];

  for (const spec of EXTERNAL_SCHEDULE_SPECS) {
    const matches = list.filter((job) => jobMatchesSpec(job, spec, repo));
    if (!matches.length) {
      if (requireAll) problems.push(`${spec.title}: fallback job is missing`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`${spec.title}: duplicate fallback jobs exist`);
    }

    const job = matches[0];
    if (Boolean(job.enabled) !== Boolean(expectEnabled)) {
      problems.push(
        `${spec.title}: expected ${expectEnabled ? "enabled" : "disabled"} but is ${job.enabled ? "enabled" : "disabled"}`,
      );
    }

    const minutes = job?.schedule?.minutes;
    if (Array.isArray(minutes) && !sameNumbers(minutes, spec.minutes)) {
      problems.push(`${spec.title}: fallback cadence is not the expected ${spec.minutes.length}-run/hour schedule`);
    }

    const expectedUrl = `/repos/${repo}/actions/workflows/${spec.workflow}/dispatches`;
    if (job?.url && !String(job.url).includes(expectedUrl)) {
      problems.push(`${spec.title}: fallback target is not ${spec.workflow}`);
    }
  }

  const listenerJobs = list.filter((job) =>
    job?.title === "BallerWatch - Telegram listener" ||
    String(job?.url || "").includes("/actions/workflows/listener.yml/dispatches")
  );
  if (listenerJobs.some((job) => job.enabled)) {
    problems.push("BallerWatch - Telegram listener: legacy polling job must stay disabled");
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
    throw new Error(`cron-job.org ${method} ${path} failed (${response.status})`);
  }
  return data;
}

export async function listExternalSchedules(apiKey = process.env.CRON_JOB_ORG_API_KEY || "") {
  if (!apiKey) throw new Error("CRON_JOB_ORG_API_KEY is required");
  const data = await cronCall(apiKey, "/jobs");
  if (data.someFailed) throw new Error("cron-job.org returned an incomplete job list");
  return Array.isArray(data.jobs) ? data.jobs : [];
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
      hours: [-1],
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

export async function syncExternalSchedules(mode, {
  apiKey = process.env.CRON_JOB_ORG_API_KEY || "",
  githubPat = process.env.CRON_GITHUB_PAT || "",
  repo = process.env.GITHUB_REPOSITORY || "vudh1/ballerwatch",
  branch = process.env.BALLERWATCH_BRANCH || "main",
} = {}) {
  if (!apiKey) throw new Error("CRON_JOB_ORG_API_KEY is required");
  if (!["enable", "disable", "ensure-disabled"].includes(mode)) {
    throw new Error("Mode must be enable, disable, or ensure-disabled");
  }

  const jobs = await listExternalSchedules(apiKey);

  if (mode === "disable") {
    const recognized = jobs.filter((job) =>
      EXTERNAL_SCHEDULE_SPECS.some((spec) => jobMatchesSpec(job, spec, repo)) ||
      job?.title === "BallerWatch - Telegram listener" ||
      String(job?.url || "").includes("/actions/workflows/listener.yml/dispatches")
    );
    for (const job of recognized.filter((job) => job.enabled)) {
      await cronCall(apiKey, `/jobs/${job.jobId}`, {
        method: "PATCH",
        body: { job: { enabled: false } },
      });
      console.log(`Disabled external fallback ${job.jobId} (${job.title || "untitled"}).`);
    }
    if (!recognized.some((job) => job.enabled)) {
      console.log("No enabled BallerWatch external schedules found.");
    }
    return;
  }

  if (!githubPat) throw new Error("CRON_GITHUB_PAT is required");

  const enabled = mode === "enable";
  for (const spec of EXTERNAL_SCHEDULE_SPECS) {
    const next = desiredJob(spec, { repo, branch, githubPat, enabled });
    const existing = jobs.find((job) => jobMatchesSpec(job, spec, repo));
    if (existing) {
      await cronCall(apiKey, `/jobs/${existing.jobId}`, {
        method: "PATCH",
        body: { job: next },
      });
      console.log(`${enabled ? "Enabled" : "Prepared disabled"} fallback ${spec.title} (${existing.jobId}).`);
    } else {
      const created = await cronCall(apiKey, "/jobs", {
        method: "PUT",
        body: { job: next },
      });
      console.log(`Created ${enabled ? "enabled" : "disabled"} fallback ${spec.title} (${created.jobId || "new"}).`);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
}

const isCli = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  await syncExternalSchedules(process.argv[2] || "");
}
