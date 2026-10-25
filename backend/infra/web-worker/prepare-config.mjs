/**
 * Builds deployment-time Cloudflare Worker configuration without runtime KV.
 *
 * v6.0.0: Cloudflare hosts the BallerWatch web API and edge runtime;
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

// D1 is deliberately opt-in: no configured database means no profile writes.
// Never invent a database ID, and never touch existing GitHub state or crons.
const databaseId = String(process.env.CALENDAR_D1_DATABASE_ID || "").trim();
if (databaseId) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(databaseId)) {
    throw new Error("Invalid CALENDAR_D1_DATABASE_ID");
  }
  config.d1_databases = [{
    binding: "CALENDAR_PROFILES",
    database_name: "ballerwatch-calendar-profiles",
    database_id: databaseId,
    migrations_dir: "migrations",
  }];
}

fs.writeFileSync("wrangler.generated.jsonc",JSON.stringify(config,null,2)+"\n");
console.log("Generated web Worker config with no KV binding and an explicit empty Cloudflare Cron Trigger list.");
