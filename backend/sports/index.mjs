/**
 * Low-cost, scheduled public professional-sport fixture catalogue.
 * This is isolated from RATS fixtures, scouting, RSVP and Web Push.
 * ESPN's public site feed is unofficial and can change; fail closed rather
 * than clearing a previously verified, encrypted fixture snapshot.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { encryptState, decryptState } from "../shared/state-crypto.mjs";
export const SPORTS_INDEX_PATH = "sports/state/fixtures.json";
export const COMPETITIONS = Object.freeze([
  { sport: "basketball", code: "nba", label: "NBA", group: "NBA" },
  { sport: "soccer", code: "eng.1", label: "Premier League", group: "club" },
  { sport: "soccer", code: "esp.1", label: "La Liga", group: "club" },
  { sport: "soccer", code: "ger.1", label: "Bundesliga", group: "club" },
  { sport: "soccer", code: "ita.1", label: "Serie A", group: "club" },
  { sport: "soccer", code: "fra.1", label: "Ligue 1", group: "club" },
  { sport: "soccer", code: "uefa.euro", label: "UEFA Euro", group: "national" },
  { sport: "soccer", code: "uefa.nations", label: "UEFA Nations League", group: "national" },
  { sport: "soccer", code: "fifa.worldq.uefa", label: "UEFA World Cup Qualifiers", group: "national" },
  { sport: "soccer", code: "conmebol.america", label: "Copa América", group: "national" },
  { sport: "soccer", code: "fifa.worldq.conmebol", label: "CONMEBOL World Cup Qualifiers", group: "national" },
  { sport: "soccer", code: "fifa.world", label: "World Cup", group: "national" },
  { sport: "soccer", code: "fifa.friendly", label: "International Friendlies", group: "national" },
]);
// Complete senior men's UEFA and CONMEBOL national-team choices, including
// teams with no fixture in the current 126-day horizon.
const UEFA_NATIONS = [
  "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belarus",
  "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus",
  "Czechia", "Denmark", "England", "Estonia", "Faroe Islands", "Finland",
  "France", "Georgia", "Germany", "Gibraltar", "Greece", "Hungary",
  "Iceland", "Israel", "Italy", "Kazakhstan", "Kosovo", "Latvia",
  "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova",
  "Montenegro", "Netherlands", "North Macedonia", "Northern Ireland",
  "Norway", "Poland", "Portugal", "Republic of Ireland", "Romania",
  "Russia", "San Marino", "Scotland", "Serbia", "Slovakia", "Slovenia",
  "Spain", "Sweden", "Switzerland", "Türkiye", "Ukraine", "Wales",
];
const CONMEBOL_NATIONS = [
  "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador",
  "Paraguay", "Peru", "Uruguay", "Venezuela",
];
export const NATIONAL_OPTIONS = Object.freeze([...new Set(
  [...UEFA_NATIONS, ...CONMEBOL_NATIONS].map(name => "National · " + name),
)]);
const norm = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 100);
export function teamLabel(comp, name) {
  const text = norm(name);
  return text ? `${comp.group === "national" ? "National" : comp.label} · ${text}` : "";
}
function apiUrl(comp, route, query = "") {
  return `https://site.api.espn.com/apis/site/v2/sports/${comp.sport}/${comp.code}/${route}${query}`;
}
export function parsedTeamRecords(payload, comp) {
  const leagues = (payload?.sports || []).flatMap(s => s?.leagues || []);
  const items = leagues.flatMap(l => l?.teams || []);
  return items.map(item => ({
    name: teamLabel(comp, item?.team?.displayName || item?.displayName),
    id: String(item?.team?.id || item?.id || "").slice(0, 30),
  })).filter(team => team.name && (!team.id || /^[A-Za-z0-9_.-]{1,30}$/.test(team.id)));
}
export function parsedTeams(payload, comp) {
  return [...new Set(parsedTeamRecords(payload, comp).map(team => team.name))];
}
export function parsedFixtures(payload, comp, teamIdNames = new Map()) {
  const games = [];
  for (const event of payload?.events || []) {
    const sides = event?.competitions?.[0]?.competitors || [];
    const home = sides.find(s => s?.homeAway === "home") || sides[0];
    const away = sides.find(s => s?.homeAway === "away") || sides[1];
    if (!home || !away || !event?.id) continue;
    const at = Date.parse(event.date);
    if (!Number.isFinite(at)) continue;
    const first = norm(home.team?.displayName || home.team?.name);
    const second = norm(away.team?.displayName || away.team?.name);
    if (!first || !second) continue;
    // A provider may say "LA Lakers" in an event but "Los Angeles Lakers"
    // in its published team list. Stable provider IDs keep selection working.
    const homeId = String(home.team?.id || home.id || "");
    const awayId = String(away.team?.id || away.id || "");
    const homeLabel = teamIdNames.get(homeId) || teamLabel(comp, first);
    const awayLabel = teamIdNames.get(awayId) || teamLabel(comp, second);
    // Match days must use the same Pacific calendar date as BallerWatch.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", year: "numeric",
      month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(at));
    const part = key => parts.find(p => p.type === key)?.value || "";
    const date = [part("year"), part("month"), part("day")].join("-");
    games.push({
      id: `watch:${comp.code}:${String(event.id).slice(0, 60)}`,
      kind: "watch", sport: comp.sport, competition: comp.label,
      title: `${first} vs ${second}`,
      date, startUtc: new Date(at).toISOString(),
      endUtc: new Date(at + (comp.sport === "basketball" ? 3 : 2) * 3600000).toISOString(),
      teams: [homeLabel, awayLabel],
      location: norm(event?.competitions?.[0]?.venue?.fullName),
      url: /^https:\/\//.test(event?.links?.[0]?.href || "") ? String(event.links[0].href).slice(0, 400) : "",
    });
  }
  return games;
}
const pad = n => String(n).padStart(2, "0");
function rangeDay(d) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}`; }
function startOfDay(d) { return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function getJson(fetcher, url) {
  const response = await fetcher(url, { headers: { accept: "application/json" },
    signal: AbortSignal.timeout(14000) });
  if (!response.ok) throw new Error(`Fixture provider status ${response.status}`);
  const text = await response.text();
  if (text.length > 4_000_000) throw new Error("Fixture response too large");
  return JSON.parse(text);
}
/**
 * ESPN retired multi-day date ranges in 2026. Calendar months and years are
 * still supported, but silently truncate to 100 games unless 'limit' is set.
 * Query published monthly fixture pages across a rolling 13-month horizon.
 * This is ~180 requests per week, with no user-request-time ESPN calls.
 */
export async function indexSports(fetcher = fetch, today = new Date(), previous = null) {
  const from = startOfDay(today);
  const until = new Date(from.getTime() + 366 * 86400000);
  const catalogue = new Set(NATIONAL_OPTIONS);
  const fixtureMap = new Map();
  const failures = [];
  const coverage = {};
  for (const comp of COMPETITIONS) {
    let teamRecords = [];
    try {
      const response = await getJson(fetcher, apiUrl(comp, "teams", "?limit=500"));
      teamRecords = parsedTeamRecords(response, comp);
      for (const team of teamRecords) catalogue.add(team.name);
    } catch {
      failures.push(comp.code + ":teams");
    }
    const idToTeam = new Map(teamRecords.filter(x => x.id).map(t => [t.id, t.name]));
    let matchesFound = 0;
    let successfulMonths = 0;
    const firstMonth = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1);
    const lastMonth = Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), 1);
    for (let month = firstMonth; month <= lastMonth;) {
      const date = new Date(month);
      const yyyymm = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}`;
      try {
        const response = await getJson(fetcher, apiUrl(comp, "scoreboard",
          `?dates=${yyyymm}&limit=1000`));
        successfulMonths++;
        const events = parsedFixtures(response, comp, idToTeam);
        // A month of any tracked competition should fit in 1000, but fail
        // rather than accept a silently truncated month.
        if (events.length >= 1000) throw new Error("Fixture month hit provider cap");
        for (const fixture of events) {
          const at = Date.parse(fixture.startUtc);
          if (at < from.getTime() - 86400000 || at >= until.getTime()) continue;
          fixtureMap.set(fixture.id, fixture);
          fixture.teams.forEach(team => catalogue.add(team));
          matchesFound++;
        }
      } catch {
        failures.push(comp.code + ":month:" + yyyymm);
      }
      month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      await delay(110);
    }
    // If all monthly responses failed, one per-team schedule is an alternate
    // route for planned fixtures. Do not turn routine empty international
    // windows into hundreds of redundant requests.
    if (!successfulMonths && teamRecords.length) {
      const visited = new Set();
      for (const team of teamRecords) {
        if (!team.id || visited.has(team.id)) continue;
        visited.add(team.id);
        try {
          const response = await getJson(fetcher, apiUrl(comp,
            "teams/" + encodeURIComponent(team.id) + "/schedule", "?limit=500"));
          for (const fixture of parsedFixtures(response, comp, idToTeam)) {
            const at = Date.parse(fixture.startUtc);
            if (at < from.getTime() - 86400000 || at >= until.getTime()) continue;
            fixtureMap.set(fixture.id, fixture);
            fixture.teams.forEach(t => catalogue.add(t));
            matchesFound++;
          }
        } catch {
          failures.push(comp.code + ":schedule");
        }
        await delay(90);
      }
    }
    // Missing upstream updates preserve previously verified fixtures.
    if ((!successfulMonths || !matchesFound) && Array.isArray(previous?.games)) {
      for (const old of previous.games.filter(g =>
        String(g.id).startsWith("watch:" + comp.code + ":") &&
        Date.parse(g.startUtc) >= from.getTime() - 86400000)) {
        if (!fixtureMap.has(old.id)) fixtureMap.set(old.id, old);
      }
    }
    coverage[comp.code] = [...fixtureMap.values()].filter(g =>
      g.id.startsWith("watch:" + comp.code + ":")).length;
  }
  for (const option of previous?.teams || []) catalogue.add(option);
  // Confirm real coverage, not merely successful HTTP responses. The NBA and
  // top five leagues each have already-published 2026-27 fixtures today.
  const required = COMPETITIONS.filter(c => c.code === "nba" || c.group === "club");
  const missing = required.filter(c => !coverage[c.code]).map(c => c.code);
  if (missing.length) throw new Error("Missing essential scheduled leagues: " + missing.join(", "));
  const games = [...fixtureMap.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc))
    .slice(0, 6000);
  const result = {
    updatedAt: today.toISOString(),
    provider: "ESPN public site feeds (unofficial)",
    refreshHours: 168,
    teams: [...catalogue].sort((a, b) => a.localeCompare(b)).slice(0, 700),
    games, failures, coverage,
  };
  console.log("Professional fixture coverage:", JSON.stringify(coverage));
  console.log("Professional fixture failures:", failures.length);
  return result;
}
export async function run() {
  let previous = null;
  try { previous = decryptState(JSON.parse(fs.readFileSync(SPORTS_INDEX_PATH,"utf8"))); } catch {}
  const index = await indexSports(fetch, new Date(), previous);
  fs.mkdirSync("sports/state",{recursive:true});
  fs.writeFileSync(SPORTS_INDEX_PATH,JSON.stringify(encryptState(index))+"\n");
  console.log(`Indexed ${index.games.length} professional fixtures and ${index.teams.length} team options; ${index.failures.length} partial sources.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
