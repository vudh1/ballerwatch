/**
 * Performs deep health, privacy, validation, edge, and external-scheduler checks.
 *
 * v2.5.0: caches encrypted scheduler audits for 6 hours; other checks remain every run.
 * v5.7.0: health checks treat the Cloudflare service as the BallerWatch Worker, while Telegram is an optional notification adapter. Runtime/private data must never be committed to Git.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { sendTelegram } from "../shared/telegram.mjs";
import { appendWebNotification } from "../shared/web-notifications.mjs";
import { checkScheduler } from "./scheduler-check.mjs";
import { planVersionAnnouncement } from "./version-announcement.mjs";

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

async function workerHealth() {
  const url = String(process.env.TELEGRAM_WEBHOOK_HEALTH_URL || "").trim();
  if (!url) return { healthy: true, problem: null };

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const payload = await response.json().catch(() => ({}));
    const knownService = new Set([
      "ballerwatch-worker",
      "ballerwatch-telegram-webhook",
    ]);
    if (!response.ok || payload?.ok !== true || !knownService.has(payload?.service)) {
      return {
        healthy: false,
        problem: {
          key: "ballerwatch-worker:unhealthy",
          message: "BallerWatch Worker: health check failed",
        },
      };
    }

    if (payload?.storage === "github-runtime-state") {
      return { healthy: true, problem: null };
    }

    if (payload?.kv !== true) {
      return {
        healthy: false,
        problem: {
          key: "edge-runtime:storage",
          message: "Cloudflare webhook: runtime storage is unavailable",
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
        key: "ballerwatch-worker:unreachable",
        message: "BallerWatch Worker: health endpoint is unreachable",
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

  const edge = await workerHealth();
  if (edge.problem) problems.push(edge.problem);

  const validation = await validationProblem();
  if (validation) problems.push(validation);

  const schedulerAudit = await checkScheduler(previous.schedulerAudit);
  problems.push(...schedulerAudit.problems);
  problems.push(...sensitivePlaintextProblems());

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(problems.map((p) => p.key).sort()))
    .digest("hex");

  const ledger = readJson("features/versions.json");
  const announcement = planVersionAnnouncement({
    ledger,
    announcementState: previous.versionAnnouncement || {},
  });
  let versionAnnouncement = announcement.nextState;
  if (announcement.message && problems.length === 0) {
    appendWebNotification("version", {
      title: "BallerWatch updated",
      body: announcement.message,
      tag: `ballerwatch-version-${ledger?.currentVersion || "update"}`,
    });
    try {
      await sendTelegram(announcement.message);
      console.log("Recorded the combined daily version announcement for Telegram + web.");
    } catch (error) {
      console.warn(
        `Telegram version delivery failed; web fallback remains available: ${error?.message || error}`,
      );
    }
  } else if (announcement.message) {
    versionAnnouncement = previous.versionAnnouncement || {};
    console.log("Deferred version announcement because the watchdog is unhealthy.");
  }

  const healthy = problems.length === 0;
  saveState({
    schedulerAudit,
    versionAnnouncement,
    healthy,
    fingerprint,
    checkedAt: new Date().toISOString(),
    problemCount: problems.length,
  });

  if (healthy) {
    console.log("All BallerWatch components are healthy.");
  } else {
    console.log(
      `Watchdog found ${problems.length} problem(s); proactive health alerts are disabled by policy.`,
    );
  }
  return { healthy, problems };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runWatchdog().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
