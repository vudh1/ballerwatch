const API = "https://api.cron-job.org";
const REPO = process.env.GITHUB_REPOSITORY || "vudh1/ballerwatch";
const BRANCH = process.env.BALLERWATCH_BRANCH || "main";
const API_KEY = process.env.CRON_JOB_ORG_API_KEY || "";
const GH_PAT = process.env.CRON_GITHUB_PAT || "";
const CLEANUP_OLD = !/^(0|false|no)$/i.test(process.env.CLEANUP_OLD_CRON || "true");

if (!API_KEY) throw new Error("CRON_JOB_ORG_API_KEY is required");
if (!GH_PAT) throw new Error("CRON_GITHUB_PAT is required");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO)) throw new Error("Invalid GITHUB_REPOSITORY");

const allMinutes = (step) =>
  step === 1
    ? [-1]
    : Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).filter((v) => v < 60);

const specs = [
  { key: "listener", title: "BallerWatch - Telegram listener", workflow: "listener.yml", minutes: allMinutes(1) },
  { key: "pickup", title: "BallerWatch - Pickup watcher", workflow: "pickup.yml", minutes: allMinutes(2) },
  { key: "league", title: "BallerWatch - League watcher", workflow: "league.yml", minutes: allMinutes(5) },
  { key: "watchdog", title: "BallerWatch - System watchdog", workflow: "watchdog.yml", minutes: allMinutes(10) },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cron(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  if (!response.ok) {
    throw new Error(`cron-job.org ${method} ${path} failed (${response.status})`);
  }
  return data;
}

function desiredJob(spec) {
  return {
    enabled: true,
    title: spec.title,
    saveResponses: false,
    url: `https://api.github.com/repos/${REPO}/actions/workflows/${spec.workflow}/dispatches`,
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
        Authorization: `Bearer ${GH_PAT}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: BRANCH }),
    },
  };
}

function isSupersededSoccerJob(job) {
  const url = String(job?.url || "");
  return (
    url.includes("/repos/vudh1/ballerbaywatch/actions/workflows/") ||
    url.includes("/repos/vudh1/ttf-watcher/actions/workflows/") ||
    url.includes("/repos/vudh1/rats-league-watcher/actions/workflows/")
  );
}

async function main() {
  const listed = await cron("/jobs");
  if (listed.someFailed) {
    throw new Error("cron-job.org returned an incomplete job list; refusing to mutate jobs");
  }
  const jobs = Array.isArray(listed.jobs) ? listed.jobs : [];
  const usedIds = new Set();

  for (const spec of specs) {
    const desired = desiredJob(spec);
    const urlMatch = jobs.find((j) => j.url === desired.url && !usedIds.has(j.jobId));
    const titleMatch = jobs.find((j) => j.title === desired.title && !usedIds.has(j.jobId));
    const existing = urlMatch || titleMatch;

    if (existing) {
      await cron(`/jobs/${existing.jobId}`, { method: "PATCH", body: { job: desired } });
      usedIds.add(existing.jobId);
      console.log(`Updated ${spec.key} cron job (${existing.jobId}).`);
    } else {
      const created = await cron("/jobs", { method: "PUT", body: { job: desired } });
      if (!created.jobId) throw new Error(`cron-job.org did not return a jobId for ${spec.key}`);
      usedIds.add(created.jobId);
      console.log(`Created ${spec.key} cron job (${created.jobId}).`);
      // cron-job.org limits job creation to one request/second.
      await sleep(1100);
    }
  }

  // Only disable old jobs after all four BallerWatch jobs were created/updated.
  if (CLEANUP_OLD) {
    for (const job of jobs.filter(
      (j) => isSupersededSoccerJob(j) && !usedIds.has(j.jobId) && j.enabled,
    )) {
      await cron(`/jobs/${job.jobId}`, { method: "PATCH", body: { job: { enabled: false } } });
      console.log(`Disabled superseded cron job ${job.jobId}.`);
    }
  }

  console.log("cron-job.org sync complete: 4 BallerWatch jobs are configured.");
}

await main();
