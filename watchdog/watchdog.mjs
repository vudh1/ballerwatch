import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { sendTelegram } from "../shared/telegram.mjs";
import { loadEncryptedLeagueState } from "../shared/league-state.mjs";
import { loadLeagueTeams } from "../shared/league-teams.mjs";

const STATE_PATH = "state/watchdog.json";
const RECOVERY_COOLDOWN_MINUTES = 10;

export const WORKFLOWS = [
  {
    file: "pickup.yml",
    label: "Pickup watcher",
    maxAgeMinutes: 7,
    activeGraceMinutes: 6,
  },
  {
    file: "league.yml",
    label: "League watcher",
    maxAgeMinutes: 15,
    activeGraceMinutes: 8,
  },
];

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

async function github(pathname, options = {}) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    throw new Error("GitHub repository/token context is missing.");
  }

  const response = await fetch(`https://api.github.com/repos/${repo}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(30_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "ballerwatch-watchdog/2.0",
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status}: ${payload.message || "request failed"}`,
    );
  }
  return payload;
}

export function ageMinutes(value, nowMs = Date.now()) {
  const ms = nowMs - Date.parse(value || "");
  return Number.isFinite(ms) ? ms / 60000 : Infinity;
}

export function analyzeWorkflowRuns(runs, spec, nowMs = Date.now()) {
  const list = Array.isArray(runs) ? runs : [];
  const latest = list[0] || null;
  const recentActive = list.find(
    (run) =>
      run.status !== "completed" &&
      ageMinutes(run.created_at, nowMs) < spec.activeGraceMinutes,
  );

  if (recentActive) {
    return {
      healthy: true,
      active: true,
      recoverable: false,
      key: null,
      message: null,
    };
  }

  if (!latest) {
    return {
      healthy: false,
      active: false,
      recoverable: true,
      key: `${spec.file}:no-runs`,
      message: `${spec.label}: no workflow run found`,
    };
  }

  if (
    latest.status !== "completed" &&
    ageMinutes(latest.created_at, nowMs) >= spec.activeGraceMinutes
  ) {
    return {
      healthy: false,
      active: false,
      recoverable: true,
      key: `${spec.file}:stalled`,
      message: `${spec.label}: latest run appears stalled`,
    };
  }

  if (
    latest.status === "completed" &&
    latest.conclusion &&
    latest.conclusion !== "success"
  ) {
    return {
      healthy: false,
      active: false,
      recoverable: true,
      key: `${spec.file}:failed`,
      message: `${spec.label}: latest run concluded ${latest.conclusion}`,
    };
  }

  const lastSuccess = list.find(
    (run) => run.status === "completed" && run.conclusion === "success",
  );
  if (!lastSuccess) {
    return {
      healthy: false,
      active: false,
      recoverable: true,
      key: `${spec.file}:no-success`,
      message: `${spec.label}: no successful run found`,
    };
  }

  if (ageMinutes(lastSuccess.updated_at || lastSuccess.created_at, nowMs) > spec.maxAgeMinutes) {
    return {
      healthy: false,
      active: false,
      recoverable: true,
      key: `${spec.file}:stale`,
      message: `${spec.label}: last successful run is stale`,
    };
  }

  return {
    healthy: true,
    active: false,
    recoverable: false,
    key: null,
    message: null,
  };
}

export function shouldDispatchRecovery(lastRecoveryAt, nowMs = Date.now()) {
  const previous = Date.parse(lastRecoveryAt || "");
  return (
    !Number.isFinite(previous) ||
    nowMs - previous >= RECOVERY_COOLDOWN_MINUTES * 60_000
  );
}

async function workflowProblem(spec) {
  const data = await github(
    `/actions/workflows/${encodeURIComponent(spec.file)}/runs?per_page=10`,
  );
  return analyzeWorkflowRuns(data.workflow_runs, spec);
}

async function dispatchRecovery(spec) {
  await github(
    `/actions/workflows/${encodeURIComponent(spec.file)}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref: "main" }),
    },
  );
}

async function telegramWebhookProblem() {
  const url = String(process.env.TELEGRAM_WEBHOOK_HEALTH_URL || "").trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true || payload?.service !== "ballerwatch-telegram-webhook") {
      return {
        key: "telegram-webhook:unhealthy",
        message: "Telegram webhook: health check failed",
        recoverable: false,
      };
    }
    return null;
  } catch {
    return {
      key: "telegram-webhook:unreachable",
      message: "Telegram webhook: health endpoint is unreachable",
      recoverable: false,
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
      recoverable: false,
    };
  }
  if (latest.status !== "completed" || latest.conclusion !== "success") {
    return {
      key: "validation:failed",
      message: `Validation: latest completed result is ${latest.conclusion || latest.status}`,
      recoverable: false,
    };
  }
  return null;
}

function checkEncryptedFile(file, label) {
  const raw = readJson(file);
  if (!raw) {
    return {
      key: `state:missing:${file}`,
      message: `${label}: encrypted state is missing`,
      recoverable: false,
    };
  }
  if (!decryptState(raw)) {
    return {
      key: `state:decrypt:${file}`,
      message: `${label}: encrypted state cannot be decrypted`,
      recoverable: false,
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
  ];

  const problems = files
    .filter((file) => fs.existsSync(file))
    .map((file) => ({
      key: `privacy:plaintext:${file}`,
      message: `Privacy: plaintext file exists: ${file}`,
      recoverable: false,
    }));

  if (fs.existsSync("pickup/data")) {
    problems.push({
      key: "privacy:pickup-data",
      message: "Privacy: plaintext pickup/data directory exists",
      recoverable: false,
    });
  }
  return problems;
}

function stateProblems() {
  const problems = [];

  if (fs.existsSync("requests/private.json")) {
    const problem = checkEncryptedFile("requests/private.json", "Private feature-request archive");
    if (problem) problems.push(problem);
  }

  for (const [file, label] of [
    ["pickup/state/feed.json", "Pickup feed"],
    ["pickup/state/events.json", "Pickup private snapshot"],
    ["pickup/state/notify.json", "Pickup notification state"],
  ]) {
    const problem = checkEncryptedFile(file, label);
    if (problem) problems.push(problem);
  }

  const teams = loadLeagueTeams();
  if (!teams.length) {
    problems.push({
      key: "state:league-teams",
      message: "League teams: encrypted configuration is missing or empty",
      recoverable: false,
    });
  }

  for (const [name, label] of [
    ["schedule.json", "League schedule"],
    ["today.json", "League today feed"],
    ["calendar-snapshot.json", "League Calendar snapshot"],
  ]) {
    const value = loadEncryptedLeagueState(name);
    if (!value) {
      problems.push({
        key: `state:league:${name}`,
        message: `${label}: encrypted state is missing or unreadable`,
        recoverable: false,
      });
    }
  }

  return problems;
}

export async function runWatchdog() {
  const previous = loadState();
  const recoveries = { ...(previous.recoveries || {}) };
  const problems = [];
  const recoveryLines = [];

  for (const spec of WORKFLOWS) {
    const assessment = await workflowProblem(spec);
    if (assessment.healthy) continue;

    const problem = {
      key: assessment.key,
      message: assessment.message,
      recoverable: assessment.recoverable,
      workflowFile: spec.file,
    };
    problems.push(problem);

    if (
      assessment.recoverable &&
      shouldDispatchRecovery(recoveries[spec.file]?.lastRecoveryAt)
    ) {
      try {
        await dispatchRecovery(spec);
        const now = new Date().toISOString();
        recoveries[spec.file] = {
          lastRecoveryAt: now,
          lastIssueKey: assessment.key,
        };
        recoveryLines.push(`↻ Recovery dispatched: ${spec.label}`);
      } catch (error) {
        problems.push({
          key: `${spec.file}:recovery-failed`,
          message: `${spec.label}: recovery dispatch failed (${error.message})`,
          recoverable: false,
        });
      }
    }
  }

  const webhook = await telegramWebhookProblem();
  if (webhook) problems.push(webhook);

  const validation = await validationProblem();
  if (validation) problems.push(validation);
  problems.push(...sensitivePlaintextProblems());
  problems.push(...stateProblems());

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
          ...recoveryLines,
        ].join("\n"),
      );
    }

    saveState({
      healthy: false,
      fingerprint,
      checkedAt: new Date().toISOString(),
      problemCount: problems.length,
      recoveries,
    });

    console.log(
      `Watchdog found ${problems.length} problem(s); ${recoveryLines.length} recovery dispatch(es).`,
    );
    return { healthy: false, problems, recoveryLines };
  }

  if (previous.healthy === false) {
    await sendTelegram(
      "✅ BallerWatch watchdog: all components recovered and healthy.",
    );
  }

  saveState({
    healthy: true,
    fingerprint,
    checkedAt: new Date().toISOString(),
    problemCount: 0,
    recoveries,
  });
  console.log("All BallerWatch components are healthy.");
  return { healthy: true, problems: [], recoveryLines: [] };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runWatchdog().catch(async (error) => {
    console.error(error);
    try {
      await sendTelegram(
        `🚨 BallerWatch watchdog itself failed: ${error.message}`,
      );
    } catch {}
    process.exit(1);
  });
}
