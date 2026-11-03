/**
 * Public RATS schedule/score source adapter (11.13.1).
 *
 * Reads only the public season registry, shared Google Visualization tables,
 * and frozen snapshots used by the official Seattle RATS standings widget.
 * Never evaluates upstream JavaScript, uses credentials, or persists sheet
 * contents outside the existing encrypted runtime-state pipeline.
 * Internal get-aggregate/get-schedule compatibility preserves watcher and ICS.
 */
export const PUBLIC_RATS_ORIGIN = "https://rats.team.op-dev.io";
export const PUBLIC_RATS_REGISTRY = PUBLIC_RATS_ORIGIN + "/lib/seasons.js";
export const PUBLIC_RATS_SOURCE = "https://seattlerats.org/schedule--standings";

export const PUBLIC_TEAM_EXPORT_HEADERS = Object.freeze([
  "Event Type", "Start Date", "Start Time", "End Date", "End Time",
  "Timezone ID", "Home or Away", "Opponent/Event Title", "Location Name",
  "Shirt Color", "Opponent Shirt Color", "Allow RSVPs", "Send Reminders",
  "Notes/Comments",
]);

const TABS = Object.freeze({
  games: "Field List",
  teams: "Team Name, Color, and Division",
  venues: "Field Name Translation",
});
const cache = new Map();
const clients = new WeakMap();
let clientSequence = 0;

function clientId(fetchImpl) {
  if (typeof fetchImpl !== "function") throw sourceError("RATS source fetch unavailable");
  if (!clients.has(fetchImpl)) clients.set(fetchImpl, ++clientSequence);
  return clients.get(fetchImpl);
}
const text = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const nameKey = (value) => text(value).toLocaleLowerCase("en-US");
const validSeason = (value) => /^(winter|spring|summer|fall)-20\d{2}$/.test(String(value || ""));

function cached(key, ttlMs, loader) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.promise;
  const promise = Promise.resolve().then(loader);
  cache.set(key, { promise, expires: now + ttlMs });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

function sourceError(message, status = 0) {
  const error = new Error(message);
  if (status) error.status = status;
  return error;
}

export function parsePublicSeasonRegistry(source) {
  if (typeof source !== "string" || source.length > 80_000) {
    throw sourceError("Unexpected RATS season registry");
  }
  // Parse literal, reviewed registry records. Never execute remote JS.
  const pattern = /\{\s*key:\s*['"]((?:winter|spring|summer|fall)-20\d{2})['"]\s*,\s*title:\s*['"][^'"]{1,60}['"]\s*,\s*sheetId:\s*['"]([A-Za-z0-9_-]{25,65})['"]([^}]*)\}/g;
  const seasons = new Map();
  for (const match of source.matchAll(pattern)) {
    const [, key, sheetId, tail] = match;
    if (seasons.has(key)) throw sourceError("Duplicate RATS season");
    seasons.set(key, { key, sheetId, frozen: /\bfrozen:\s*true\b/.test(tail) });
    if (seasons.size > 40) throw sourceError("Too many RATS seasons");
  }
  if (!seasons.size) throw sourceError("No published RATS seasons");
  return seasons;
}

async function publicText(url, { fetchImpl, timeoutMs }) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json,text/javascript,text/plain" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw sourceError("Public RATS source HTTP " + response.status, response.status);
  const value = await response.text();
  if (!value || value.length > 6_000_000) throw sourceError("Invalid public RATS response length");
  return value;
}

export function parsePublicGviz(value) {
  const prefix = /^\s*(?:\/\*[\s\S]*?\*\/\s*)?google\.visualization\.Query\.setResponse\s*\(/;
  const matched = String(value || "").match(prefix);
  if (!matched) throw sourceError("Unrecognized RATS Google Visualization response");
  const tail = value.slice(matched[0].length).trim();
  if (!tail.endsWith(");")) throw sourceError("Incomplete RATS Google Visualization response");
  const data = JSON.parse(tail.slice(0, -2));
  if (data?.status !== "ok" || !Array.isArray(data?.table?.cols) ||
      !Array.isArray(data?.table?.rows) || data.table.rows.length > 12_000 ||
      data.table.cols.length > 120) {
    throw sourceError("Invalid RATS public sheet schema");
  }
  const headers = data.table.cols.map((col) => text(col?.label));
  const rows = data.table.rows.map((row) => headers.map((_, index) => {
    const value = row?.c?.[index]?.v;
    if (value == null) return "";
    const type = data.table.cols[index]?.type;
    if ((type === "date" || type === "datetime") && typeof value === "string") {
      const m = /^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,(\d{1,2}),(\d{1,2}),(\d{1,2}))?\)/.exec(value);
      if (m) {
        const iso = m[1] + "-" + String(Number(m[2]) + 1).padStart(2, "0") +
          "-" + m[3].padStart(2, "0");
        if (type === "date") return iso;
        const clock = [m[4] || 0, m[5] || 0, m[6] || 0]
          .map((num) => String(num).padStart(2, "0")).join(":");
        return iso === "1899-12-30" ? clock : iso + "T" + clock;
      }
    }
    if (type === "timeofday" && Array.isArray(value)) {
      return value.slice(0, 3).map((num) => String(num || 0).padStart(2, "0")).join(":");
    }
    return value;
  }));
  return { headers, rows };
}

function recordRows(table) {
  return table.rows.map((values) => {
    const result = {};
    table.headers.forEach((header, index) => {
      if (header && !(header in result)) result[header] = values[index] ?? "";
    });
    return result;
  });
}

function seasonDate(value) {
  if (typeof value === "number") {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000)
      .toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw)) return raw.slice(0, 10);
  return "";
}

function seasonTime(value) {
  if (typeof value === "number" && value >= 0 && value < 1) {
    const seconds = Math.round(value * 86400) % 86400;
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((part) => String(part).padStart(2, "0")).join(":");
  }
  const raw = text(value);
  const match = /(?:^|T)(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (match && Number(match[1]) <= 23 && Number(match[2]) <= 59) {
    return [match[1], match[2], match[3] || "00"]
      .map((part) => part.padStart(2, "0")).join(":");
  }
  const local = /^(\d{1,2})\D+(\d{2})\s*([ap])\.?m?\.?$/i.exec(raw);
  if (local && Number(local[1]) <= 12 && Number(local[2]) <= 59) {
    const hour = (Number(local[1]) % 12) + (local[3].toLowerCase() === "p" ? 12 : 0);
    return String(hour).padStart(2, "0") + ":" + local[2] + ":00";
  }
  return "";
}

function validScore(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 99 ? number : null;
}

function onlyColor(value) {
  const color = text(value);
  return !color || color.startsWith("#N/A") ? null : color.slice(0, 50);
}

function requiredHeaders(table, names) {
  if (!table || !Array.isArray(table.headers) ||
      names.some((name) => !table.headers.includes(name))) {
    throw sourceError("Published RATS sheet headers changed");
  }
}

export function aggregatePublicRatsTables({ games, teams, venues }) {
  requiredHeaders(games, ["Home", "Away", "Date", "Time", "Location", "Home Score", "Away Score"]);
  requiredHeaders(teams, ["Team", "Day", "Gender", "Division"]);
  requiredHeaders(venues, ["PARKS"]);
  const fieldMap = new Map();
  const venueToIndex = venues.headers.findIndex((header) => /team cowboy/i.test(header));
  for (const row of venues.rows) {
    const source = text(row[0]);
    if (source) fieldMap.set(source, text(row[venueToIndex >= 0 ? venueToIndex : 1]) || source);
  }
  const teamList = recordRows(teams)
    .filter((row) => text(row.Team) && nameKey(row.Team) !== "tbd")
    .map((row) => {
      const name = text(row.Team);
      return {
        name, day: text(row.Day), gender: text(row.Gender),
        division: text(row.Division), color: onlyColor(row.Color),
        color_alt: onlyColor(row["2nd Color"]), over_30: Boolean(row.O30),
        // Internal only: a stable per-team handle, never a credential.
        schedule_key: "public:" + encodeURIComponent(name),
      };
    })
    .filter((team) => team.day || team.division);
  if (teamList.length < 2 || teamList.length > 3000) {
    throw sourceError("Incomplete published RATS team directory");
  }
  const headers = games.headers;
  const hasPublish = headers.includes("Publish");
  const hasColors = headers.includes("Home Color") && headers.includes("Away Color");
  const events = [];
  const seen = new Set();
  for (const row of recordRows(games)) {
    const home = text(row.Home), away = text(row.Away);
    if (!home || !away || (hasPublish && !row.Publish)) continue;
    if (hasColors && !text(row["Home Color"]) && !text(row["Away Color"])) continue;
    const date = seasonDate(row.Date), time = seasonTime(row.Time);
    if (!date || !time) continue;
    const identity = [date, time, nameKey(home), nameKey(away), text(row.Location)].join("|");
    if (seen.has(identity)) continue;
    seen.add(identity);
    const h = validScore(row["Home Score"]), a = validScore(row["Away Score"]);
    const park = text(row.Location);
    events.push({
      home_team_name: home, away_team_name: away,
      start_date: date, start_time: time,
      location: fieldMap.get(park) || park,
      home_color: onlyColor(row["Home Color"]),
      away_color: onlyColor(row["Away Color"]),
      notes: text(row["Notes TC"] || row.NotesTC || ""),
      score: h === null || a === null ? null : String(h) + "-" + String(a),
    });
  }
  if (!events.length || events.length > 5000) {
    throw sourceError("Missing or oversized RATS published fixtures");
  }
  const teamMap = new Map(teamList.map((team) => [team.name, team]));
  for (const event of events) {
    if (event.home_color && event.home_color === event.away_color) {
      const alternative = teamMap.get(event.home_team_name)?.color_alt;
      if (alternative) event.home_color = alternative;
    }
  }
  events.sort((a, b) => a.start_date.localeCompare(b.start_date) ||
    a.start_time.localeCompare(b.start_time) ||
    a.home_team_name.localeCompare(b.home_team_name));
  return { teams: teamList, events };
}

export function publicTeamSchedule(aggregate, key) {
  if (typeof key !== "string" || !key.startsWith("public:")) {
    throw sourceError("Unknown RATS public team schedule handle");
  }
  const team = aggregate.teams.find((entry) => entry.schedule_key === key);
  if (!team) throw sourceError("RATS public team is not in this season");
  const rows = (aggregate.events || [])
    .filter((event) => nameKey(event.home_team_name) === nameKey(team.name) ||
      nameKey(event.away_team_name) === nameKey(team.name))
    .map((event) => {
      const home = nameKey(event.home_team_name) === nameKey(team.name);
      return [
        "game", event.start_date, event.start_time, "", "", "US/Pacific",
        home ? "Home" : "Away",
        home ? event.away_team_name : event.home_team_name,
        event.location || "",
        home ? event.home_color || "" : event.away_color || "",
        home ? event.away_color || "" : event.home_color || "",
        "Yes", "Yes", event.notes || "",
      ];
    });
  return [PUBLIC_TEAM_EXPORT_HEADERS, ...rows];
}

function gvizUrl(sheetId, tab) {
  return "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(sheetId) +
    "/gviz/tq?tqx=out:json&headers=1&sheet=" + encodeURIComponent(tab);
}

export async function publishedRatsCall(action, params, {
  fetchImpl = globalThis.fetch, timeoutMs = 15000,
} = {}) {
  const season = text(params?.season);
  if (!validSeason(season)) throw sourceError("Invalid RATS season");
  const scope = String(clientId(fetchImpl)) + ":";
  const registry = await cached(scope + "public-rats-registry", 30 * 60000, async () =>
    parsePublicSeasonRegistry(await publicText(PUBLIC_RATS_REGISTRY, { fetchImpl, timeoutMs })));
  const entry = registry.get(season);
  if (!entry) {
    if (action === "get-aggregate") return { teams: [], events: [] };
    throw sourceError("RATS season is not published");
  }
  const aggregate = await cached(scope + "public-rats-season:" + season,
    entry.frozen ? 24 * 3600000 : 240000, async () => {
      if (entry.frozen) {
        const url = PUBLIC_RATS_ORIGIN + "/data/" + season + ".json";
        const value = JSON.parse(await publicText(url, { fetchImpl, timeoutMs }));
        if (!Array.isArray(value.teams) || !Array.isArray(value.events) ||
            !value.teams.length || value.events.length > 5000) {
          throw sourceError("Unexpected frozen RATS season schema");
        }
        return {
          teams: value.teams.map((team) => ({
            ...team, schedule_key: "public:" + encodeURIComponent(text(team.name)),
          })),
          events: value.events,
        };
      }
      const [games, teams, venues] = await Promise.all(
        [TABS.games, TABS.teams, TABS.venues].map(async (tab) =>
          parsePublicGviz(await publicText(gvizUrl(entry.sheetId, tab),
            { fetchImpl, timeoutMs }))));
      return aggregatePublicRatsTables({ games, teams, venues });
    });
  if (action === "get-aggregate") return aggregate;
  if (action === "get-schedule") return publicTeamSchedule(aggregate, String(params?.key || ""));
  throw sourceError("Unsupported RATS source action");
}
