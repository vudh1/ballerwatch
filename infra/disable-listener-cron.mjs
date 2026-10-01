const API = "https://api.cron-job.org";
const API_KEY = process.env.CRON_JOB_ORG_API_KEY || "";
if (!API_KEY) throw new Error("CRON_JOB_ORG_API_KEY is required");

async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`cron-job.org ${method} ${path} failed (${response.status})`);
  return data;
}

const listed = await call("/jobs");
const jobs = Array.isArray(listed.jobs) ? listed.jobs : [];
const matches = jobs.filter(job =>
  job.enabled &&
  (
    job.title === "BallerWatch - Telegram listener" ||
    String(job.url || "").includes("/ballerwatch/actions/workflows/listener.yml/dispatches")
  )
);

for (const job of matches) {
  await call(`/jobs/${job.jobId}`, { method: "PATCH", body: { job: { enabled: false } } });
  console.log(`Disabled old listener cron job ${job.jobId}.`);
}
if (!matches.length) console.log("No enabled listener cron job found.");
