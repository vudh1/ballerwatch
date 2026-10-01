import fs from "node:fs";

const token=process.env.CLOUDFLARE_API_TOKEN||"";
const account=process.env.CLOUDFLARE_ACCOUNT_ID||"";
if(!token||!account) throw new Error("Cloudflare credentials are required");

const API="https://api.cloudflare.com/client/v4";
const title="ballerwatch-runtime";

async function cf(path,{method="GET",body}={}) {
  const r=await fetch(API+path,{
    method,
    headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
    body:body?JSON.stringify(body):undefined,
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.success===false) throw new Error(`Cloudflare API failed ${method} ${path}: ${r.status}`);
  return data.result;
}

const namespaces=await cf(`/accounts/${account}/storage/kv/namespaces?per_page=1000`);
let ns=(Array.isArray(namespaces)?namespaces:[]).find(x=>x.title===title);
if(!ns) {
  ns=await cf(`/accounts/${account}/storage/kv/namespaces`,{method:"POST",body:{title}});
  console.log("Created private KV namespace for BallerWatch runtime.");
} else {
  console.log("Using existing BallerWatch runtime KV namespace.");
}

if(!ns?.id) throw new Error("KV namespace id was not returned");

const config={
  "$schema":"node_modules/wrangler/config-schema.json",
  name:"ballerwatch-telegram",
  main:"worker.mjs",
  compatibility_date:"2026-09-30",
  workers_dev:true,
  kv_namespaces:[{binding:"BALLERWATCH_STATE",id:ns.id}],
  triggers:{crons:["*/2 * * * *","*/5 * * * *","*/10 * * * *"]},
};

fs.writeFileSync("wrangler.generated.jsonc",JSON.stringify(config,null,2)+"\n");
console.log("Generated Worker config with private KV and 2/5/10-minute edge schedules.");
