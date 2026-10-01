const API="https://api.cron-job.org";
const REPO=process.env.GITHUB_REPOSITORY||"vudh1/ballerwatch";
const BRANCH=process.env.BALLERWATCH_BRANCH||"main";
const API_KEY=process.env.CRON_JOB_ORG_API_KEY||"";
const GH_PAT=process.env.CRON_GITHUB_PAT||"";
if(!API_KEY) throw new Error("CRON_JOB_ORG_API_KEY is required");
if(!GH_PAT) throw new Error("CRON_GITHUB_PAT is required");

const allMinutes=step=>Array.from({length:Math.ceil(60/step)},(_,i)=>i*step).filter(v=>v<60);
const specs=[
  {title:"BallerWatch - Pickup watcher",workflow:"pickup.yml",minutes:allMinutes(2)},
  {title:"BallerWatch - League watcher",workflow:"league.yml",minutes:allMinutes(5)},
  {title:"BallerWatch - System watchdog",workflow:"watchdog.yml",minutes:allMinutes(10)},
];

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

function desired(spec) {
  return {
    enabled:true,
    title:spec.title,
    saveResponses:false,
    url:`https://api.github.com/repos/${REPO}/actions/workflows/${spec.workflow}/dispatches`,
    requestMethod:1,
    requestTimeout:30,
    redirectSuccess:false,
    schedule:{
      timezone:"UTC",expiresAt:0,hours:[-1],mdays:[-1],
      minutes:spec.minutes,months:[-1],wdays:[-1],
    },
    notification:{
      onFailure:true,onFailureCount:1,onSuccess:true,onDisable:true,onSslCertExpiry:false,mode:1,
    },
    extendedData:{
      headers:{
        Accept:"application/vnd.github+json",
        Authorization:`Bearer ${GH_PAT}`,
        "X-GitHub-Api-Version":"2022-11-28",
        "Content-Type":"application/json",
      },
      body:JSON.stringify({ref:BRANCH}),
    },
  };
}

const listed=await call("/jobs");
if(listed.someFailed) throw new Error("cron-job.org returned an incomplete job list");
const jobs=Array.isArray(listed.jobs)?listed.jobs:[];

for(const spec of specs) {
  const next=desired(spec);
  const existing=jobs.find(job=>
    job.title===spec.title ||
    String(job.url||"")===next.url
  );
  if(existing) {
    await call(`/jobs/${existing.jobId}`,{method:"PATCH",body:{job:next}});
    console.log(`Restored external fallback ${spec.title} (${existing.jobId}).`);
  } else {
    const created=await call("/jobs",{method:"PUT",body:{job:next}});
    console.log(`Created external fallback ${spec.title} (${created.jobId||"new"}).`);
    await new Promise(resolve=>setTimeout(resolve,1100));
  }
}
