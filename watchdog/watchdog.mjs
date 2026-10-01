import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { sendTelegram } from "../shared/telegram.mjs";
import {
  analyzeExternalSchedules,
  listExternalSchedules,
} from "../infra/external-schedules.mjs";

const STATE_PATH = "state/watchdog.json";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function loadState() {
  const raw = readJson(STATE_PATH);
  const value = raw ? decryptState(raw) : null;
  return value && typeof value === "object" ? value : {};
}

function saveState(value) {
  const old = loadState();
  if (JSON.stringify(old) === JSON.stringify(value)) return false;
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(encryptState(value), null, 2) + "\n",
  );
  return true;
}

async function github(pathname) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error("GitHub repository/token context is missing.");

  const response = await fetch(`https://api.github.com/repos/${repo}${pathname}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "ballerwatch-watchdog/2.2",
    },
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${payload.message || "request failed"}`);
  }
  return payload;
}

async function telegramWebhookHealth() {
  const url = String(process.env.TELEGRAM_WEBHOOK_HEALTH_URL || "").trim();
  if (!url) return { healthy: true, problem: null };

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true || payload?.service !== "ballerwatch-telegram-webhook") {
      return {
        healthy: false,
        problem: {
          key: "telegram-webhook:unhealthy",
          message: "Telegram webhook: health check failed",
        },
      };
    }

    if (payload?.kv !== true) {
      return {
        healthy: false,
        problem: {
          key: "edge-runtime:kv",
          message: "Cloudflare runtime: KV binding is unavailable",
        },
      };
    }

    const pickupAge = Number(payload?.pickupAgeMinutes);
    const leagueAge = Number(payload?.leagueAgeMinutes);
    if (!Number.isFinite(pickupAge) || pickupAge > 8) {
      return {
        healthy: false,
        problem: {
          key: "edge-runtime:pickup-stale",
          message: "Cloudflare runtime: pickup heartbeat is stale",
        },
      };
    }
    if (!Number.isFinite(leagueAge) || leagueAge > 12) {
      return {
        healthy: false,
        problem: {
          key: "edge-runtime:league-stale",
          message: "Cloudflare runtime: league heartbeat is stale",
        },
      };
    }

    return { healthy: true, problem: null };
  } catch {
    return {
      healthy: false,
      problem: {
        key: "telegram-webhook:unreachable",
        message: "Telegram webhook: health endpoint is unreachable",
      },
    };
  }
}

async function validationProblem() {
  const data = await github("/actions/workflows/validate.yml/runs?per_page=5");
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  const latest = runs.find((run) => run.status === "completed") || runs[0];

  if (!latest) {
    return {
      key: "validation:no-run",
      message: "Validation: no completed run found",
    };
  }
  if (latest.status !== "completed" || latest.conclusion !== "success") {
    return {
      key: "validation:failed",
      message: `Validation: latest completed result is ${latest.conclusion || latest.status}`,
    };
  }
  return null;
}

async function externalCronProblems(edgeHealthy) {
  try {
    const jobs = await listExternalSchedules();
    const messages = analyzeExternalSchedules(jobs, {
      repo: process.env.GITHUB_REPOSITORY || "vudh1/ballerwatch",
      expectEnabled: edgeHealthy ? false : null,
      requireAll: true,
    });
    return messages.map((message, index) => ({
      key: `external-cron:${index}:${message}`,
      message: `cron-job.org fallback: ${message}`,
    }));
  } catch (error) {
    return [{
      key: "external-cron:unreachable",
      message: `cron-job.org fallback: unable to verify jobs (${error.message})`,
    }];
  }
}

function sensitivePlaintextProblems() {
  const files = [
    "league/teams.json",
    "league/schedule.json",
    "league/today.json",
    "league/calendar-snapshot.json",
    "league/calendar-changes.json",
    "league/telegram-update.json",
    "league/score-changes.json",
    "league/status.json",
  ];

  const problems = files
    .filter((file) => fs.existsSync(file))
    .map((file) => ({
      key: `privacy:plaintext:${file}`,
      message: `Privacy: plaintext runtime file exists: ${file}`,
    }));

  if (fs.existsSync("pickup/data")) {
    problems.push({
      key: "privacy:pickup-data",
      message: "Privacy: plaintext pickup/data directory exists",
    });
  }
  return problems;
}

export async function runWatchdog() {
  const previous = loadState();
  const problems = [];

  const edge = await telegramWebhookHealth();
  if (edge.problem) problems.push(edge.problem);

  const validation = await validationProblem();
  if (validation) problems.push(validation);

  problems.push(...await externalCronProblems(edge.healthy));
  problems.push(...sensitivePlaintextProblems());

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(problems.map((p) => p.key).sort()))
    .digest("hex");

  if (problems.length) {
    if (previous.fingerprint !== fingerprint || previous.healthy !== false) {
      await sendTelegram(
        [
          "🚨 BallerWatch watchdog",
          ...problems.map((p) => `• ${p.message}`),
        ].join("\n"),
      );
    }

    saveState({
      healthy: false,
      fingerprint,
      checkedAt: new Date().toISOString(),
      problemCount: problems.length,
    });
    console.log(`Watchdog found ${problems.length} problem(s).`);
    return { healthy: false, problems };
  }

  if (previous.healthy === false) {
    await sendTelegram("✅ BallerWatch watchdog: all components recovered and healthy.");
  }

  saveState({
    healthy: true,
    fingerprint,
    checkedAt: new Date().toISOString(),
    problemCount: 0,
  });
  console.log("All BallerWatch components are healthy.");
  return { healthy: true, problems: [] };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runWatchdog().catch(async (error) => {
    console.error(error);
    try {
      await sendTelegram(`🚨 BallerWatch watchdog itself failed: ${error.message}`);
    } catch {}
    process.exit(1);
  });
}
