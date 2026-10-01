const API="https://api.cron-job.org";
const API_KEY=process.env.CRON_JOB_ORG_API_KEY||"";
if(!API_KEY) throw new Error("CRON_JOB_ORG_API_KEY is required");

async function call(path,{method="GET",body}={}) {
  const response=await fetch(API+path,{
    method,
    headers:{Authorization:`Bearer ${API_KEY}`,"Content-Type":"application/json"},
    body:body?JSON.stringify(body):undefined,
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`cron-job.org ${method} ${path} failed (${response.status})`);
  return data;
}

const listed=await call("/jobs");
const jobs=Array.isArray(listed.jobs)?listed.jobs:[];
const workflowNames=["listener.yml","pickup.yml","league.yml","watchdog.yml"];
const titles=[
  "BallerWatch - Telegram listener",
  "BallerWatch - Pickup watcher",
  "BallerWatch - League watcher",
  "BallerWatch - System watchdog",
];

const matches=jobs.filter(job=>job.enabled && (
  titles.includes(job.title) ||
  workflowNames.some(name=>String(job.url||"").includes(`/ballerwatch/actions/workflows/${name}/dispatches`))
));

for(const job of matches) {
  await call(`/jobs/${job.jobId}`,{method:"PATCH",body:{job:{enabled:false}}});
  console.log(`Disabled legacy external schedule ${job.jobId} (${job.title||"untitled"}).`);
}
if(!matches.length) console.log("No enabled BallerWatch external schedules found.");
