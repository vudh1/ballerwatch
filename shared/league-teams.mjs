import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "./state-crypto.mjs";

export const LEAGUE_TEAM_STATE_PATH = "league/state/teams.json";
export const LEAGUE_TEAM_RUNTIME_PATH = "league/teams.json";
export const DEFAULT_LEAGUE_TEAMS = ["Third Touch FC", "PhoSaiGon"];

export function normalizeLeagueTeamName(name) {
  let value = String(name || "").trim().replace(/\s+/g, " ");
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function dedupeTeams(teams) {
  const output = [];
  const seen = new Set();
  for (const raw of Array.isArray(teams) ? teams : []) {
    const name = normalizeLeagueTeamName(raw);
    if (!name) continue;
    const key = name.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(name);
  }
  return output;
}

function loadLegacyLeagueTeams() {
  try {
    const legacy = JSON.parse(fs.readFileSync(LEAGUE_TEAM_RUNTIME_PATH, "utf8"));
    if (Array.isArray(legacy?.teams)) return dedupeTeams(legacy.teams);
  } catch {}
  return [];
}

export function loadLeagueTeams() {
  try {
    const encrypted = JSON.parse(fs.readFileSync(LEAGUE_TEAM_STATE_PATH, "utf8"));
    const payload = decryptState(encrypted);
    if (payload && Array.isArray(payload.teams) && payload.teams.length) {
      return dedupeTeams(payload.teams);
    }
  } catch {}

  // One-time migration path from the old plaintext config.
  const legacy = loadLegacyLeagueTeams();
  if (legacy.length) return legacy;

  // Fresh installs bootstrap these defaults in priority order. Once encrypted
  // state exists, Telegram add/remove/rename commands remain authoritative.
  return [...DEFAULT_LEAGUE_TEAMS];
}

export function saveLeagueTeams(teams) {
  const cleaned = dedupeTeams(teams);
  if (!cleaned.length) {
    throw new Error("At least one monitored league team is required.");
  }

  fs.mkdirSync(path.dirname(LEAGUE_TEAM_STATE_PATH), { recursive: true });
  fs.writeFileSync(
    LEAGUE_TEAM_STATE_PATH,
    JSON.stringify(encryptState({ teams: cleaned }), null, 2) + "\n",
  );
  return cleaned;
}

export function ensureEncryptedLeagueTeams() {
  const teams = loadLeagueTeams();
  if (!teams.length) return [];
  if (!fs.existsSync(LEAGUE_TEAM_STATE_PATH)) saveLeagueTeams(teams);
  return teams;
}

export function writeRuntimeLeagueTeams() {
  const teams = ensureEncryptedLeagueTeams();
  if (!teams.length) {
    throw new Error("No monitored league teams are configured.");
  }
  fs.writeFileSync(
    LEAGUE_TEAM_RUNTIME_PATH,
    JSON.stringify({ teams }, null, 2) + "\n",
  );
  return teams;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const command = process.argv[2] || "";
  if (command === "prepare") {
    const teams = writeRuntimeLeagueTeams();
    console.log(`Prepared ${teams.length} encrypted league team(s) for runtime.`);
  } else if (command === "migrate") {
    const legacyTeams = loadLegacyLeagueTeams();
    const teams = legacyTeams.length ? saveLeagueTeams(legacyTeams) : ensureEncryptedLeagueTeams();
    if (!teams.length) throw new Error("No league teams available to migrate.");
    console.log(`Encrypted ${teams.length} league team(s).`);
  } else if (command === "list-count") {
    console.log(loadLeagueTeams().length);
  } else {
    throw new Error("Usage: node shared/league-teams.mjs prepare|migrate|list-count");
  }
}
