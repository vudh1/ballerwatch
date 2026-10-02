/**
 * Builds deployment-time Cloudflare Worker configuration without runtime KV.
 *
 * Documentation baseline: v2.4.0. Cloudflare hosts only the Telegram webhook/fast path;
 * durable state and recurring schedules live on GitHub/cron-job.org.
 */
import fs from "node:fs";

const token=process.env.CLOUDFLARE_API_TOKEN||"";
const account=process.env.CLOUDFLARE_ACCOUNT_ID||"";
if(!token||!account) throw new Error("Cloudflare credentials are required");

const config={
  "$schema":"node_modules/wrangler/config-schema.json",
  name:"ballerwatch-web",
  main:"worker.mjs",
  compatibility_date:"2026-09-30",
  workers_dev:true,
  triggers:{ crons:[] }
};

fs.writeFileSync("wrangler.generated.jsonc",JSON.stringify(config,null,2)+"\n");
console.log("Generated web Worker config with no KV binding and an explicit empty Cloudflare Cron Trigger list.");
