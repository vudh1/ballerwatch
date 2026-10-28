/**
 * Low-cost, scheduled public professional-sport fixture catalogue.
 * This is isolated from RATS fixtures, scouting, RSVP and Web Push.
 * Domestic leagues, knockout cups and international club trophies share selected
 * club identities by name, with FIFA national-team tournaments kept separate.
 * ESPN's public site feed is unofficial and can change; fail closed rather
 * than clearing a previously verified, encrypted fixture snapshot.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { encryptState, decryptState } from "../shared/state-crypto.mjs";
import { publishedUsBroadcasts } from "./broadcasts.mjs";
import { withPublishedPrimeVideo } from "./prime-video.mjs";
import { DROGON_LINEUP_CAPTURED_AT, matchDrogonChannels } from "./drogon-lineup.mjs";
// ESPN competition slugs may contain underscores (e.g. eng.league_cup).
// Preserve the source-qualified UID namespace across indexing and smoke checks.
export function watchCompetitionCode(id) {
  return /^watch:([a-z0-9._]+):/.exec(String(id || ""))?.[1] || "";
}
export const SPORTS_INDEX_PATH = "sports/state/fixtures.json";
export const COMPETITIONS = Object.freeze([
  { sport: "basketball", code: "nba", label: "NBA", group: "NBA" },
  { sport: "soccer", code: "eng.1", label: "Premier League", group: "club" },
  { sport: "soccer", code: "eng.league_cup", label: "EFL Cup", group: "cup" },
  { sport: "soccer", code: "eng.fa", label: "FA Cup", group: "cup" },
  { sport: "soccer", code: "eng.charity", label: "FA Community Shield", group: "cup" },
  { sport: "soccer", code: "esp.1", label: "La Liga", group: "club" },
  { sport: "soccer", code: "esp.copa_del_rey", label: "Copa del Rey", group: "cup" },
  { sport: "soccer", code: "esp.super_cup", label: "Supercopa de España", group: "cup" },
  { sport: "soccer", code: "ger.1", label: "Bundesliga", group: "club" },
  { sport: "soccer", code: "ita.1", label: "Serie A", group: "club" },
  { sport: "soccer", code: "fra.1", label: "Ligue 1", group: "club" },
  { sport: "soccer", code: "uefa.champions", label: "UEFA Champions League", group: "cup" },
  { sport: "soccer", code: "uefa.europa", label: "UEFA Europa League", group: "cup" },
  { sport: "soccer", code: "uefa.europa.conf", label: "UEFA Conference League", group: "cup" },
  { sport: "soccer", code: "uefa.super_cup", label: "UEFA Super Cup", group: "cup" },
  { sport: "soccer", code: "fifa.cwc", label: "FIFA Club World Cup", group: "cup" },
  { sport: "soccer", code: "fifa.intercontinental_cup", label: "FIFA Intercontinental Cup", group: "cup" },
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
    const broadcasts = publishedUsBroadcasts(event, comp);
    const fixture = {
      id: `watch:${comp.code}:${String(event.id).slice(0, 60)}`,
      kind: "watch", sport: comp.sport, competition: comp.label,
      title: `${first} vs ${second}`,
      date, startUtc: new Date(at).toISOString(),
      endUtc: new Date(at + (comp.sport === "basketball" ? 3 : 2) * 3600000).toISOString(),
      teams: [homeLabel, awayLabel],
      location: norm(event?.competitions?.[0]?.venue?.fullName),
      broadcasts,
      drogonChannels: matchDrogonChannels(broadcasts),
      drogonBroadcastKey: JSON.stringify(broadcasts),
      url: /^https:\/\//.test(event?.links?.[0]?.href || "") ? String(event.links[0].href).slice(0, 400) : "",
    };
    const confirmed = withPublishedPrimeVideo(fixture);
    confirmed.drogonChannels = matchDrogonChannels(confirmed.broadcasts);
    confirmed.drogonBroadcastKey = JSON.stringify(confirmed.broadcasts);
    games.push(confirmed);
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
 * This is bounded to one teams lookup and 13 monthly pages per competition
 * each week (plus sparse recovery); never query ESPN on a user's request.
 */
// Keep established team subscriptions selectable if large knockout tournaments
// add hundreds of lower-division opponents. Limit only the visible choices;
// fixture coverage and source-qualified calendar IDs stay intact.
export function prioritizedTeamOptions(core, all, previous = [], limit = 700) {
  const priority = new Set([...core, ...previous]);
  const sorted = values => [...values].sort((a, b) => a.localeCompare(b));
  return [...sorted(priority),
    ...sorted(new Set([...all].filter(x => !priority.has(x))))].slice(0, limit);
}
export async function indexSports(fetcher = fetch, today = new Date(), previous = null) {
  const from = startOfDay(today);
  const until = new Date(from.getTime() + 366 * 86400000);
  const catalogue = new Set(NATIONAL_OPTIONS);
  const coreOptions = new Set(NATIONAL_OPTIONS);
  const fixtureMap = new Map();
  const failures = [];
  const coverage = {};
  for (const comp of COMPETITIONS) {
    let teamRecords = [];
    try {
      const response = await getJson(fetcher, apiUrl(comp, "teams", "?limit=500"));
      teamRecords = parsedTeamRecords(response, comp);
      for (const team of teamRecords) {
        catalogue.add(team.name);
        if (comp.group === "club" || comp.sport === "basketball") {
          coreOptions.add(team.name);
        }
      }
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
          // ESPN does not always repeat an announced TV assignment in every
          // scoreboard payload. Keep the last confirmed channel for that ID.
          if (!fixture.broadcasts.length) {
            const old = fixtureMap.get(fixture.id) || previous?.games?.find(g => g.id === fixture.id);
            if (Array.isArray(old?.broadcasts)) fixture.broadcasts = old.broadcasts;
          }
          fixtureMap.set(fixture.id, fixture);
          fixture.teams.forEach(team => {
            catalogue.add(team);
            if (comp.group === "club" || comp.sport === "basketball") {
              coreOptions.add(team);
            }
          });
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
    // Large cup registries (especially the FA Cup) can list hundreds of
    // teams; do not trigger hundreds of fallback requests after an outage.
    if (!successfulMonths && teamRecords.length &&
        (comp.group !== "cup" || teamRecords.length <= 24)) {
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
  // The match-to-lineup join is prepared in Actions, including older fixtures
  // retained after upstream failures. API reads and mobile renders do no join.
  const games = [...fixtureMap.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc))
    .slice(0, 6000).map(game => {
      const confirmed = withPublishedPrimeVideo(game);
      return { ...confirmed, drogonChannels: matchDrogonChannels(confirmed.broadcasts),
        drogonBroadcastKey: JSON.stringify(confirmed.broadcasts || []) };
    });
  const result = {
    updatedAt: today.toISOString(),
    broadcastUpdatedAt: today.toISOString(),
    drogonLineupCapturedAt: DROGON_LINEUP_CAPTURED_AT,
    provider: "ESPN public site feeds (unofficial)",
    refreshHours: 168,
    teams: prioritizedTeamOptions(coreOptions, catalogue, previous?.teams),
    games, failures, coverage,
  };
  console.log("Professional fixture coverage:", JSON.stringify(coverage));
  console.log("Professional fixture failures:", failures.length);
  return result;
}
/**
 * Daily lightweight update of published broadcasts for the next three weeks.
 * Unlike the weekly annual backfill, this queries at most two calendar months
 * per competition and never blocks /web/sports with provider requests.
 */
export async function refreshUpcomingBroadcasts(fetcher = fetch, today = new Date(), previous = null) {
  if (!previous || !Array.isArray(previous.games) || !previous.games.length) {
    throw new Error("Missing verified professional fixture catalogue");
  }
  const from = startOfDay(today);
  const until = new Date(from.getTime() + 21 * 86400000);
  const existing = new Map(previous.games.map(game => [game.id, game]));
  let successfulMonths = 0;
  let changed = 0;
  const firstMonth = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1);
  const lastMonth = Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), 1);
  for (const comp of COMPETITIONS) {
    for (let month = firstMonth; month <= lastMonth;) {
      const date = new Date(month);
      const yyyymm = `${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}`;
      try {
        const payload = await getJson(fetcher, apiUrl(comp, "scoreboard",
          `?dates=${yyyymm}&limit=1000`));
        successfulMonths++;
        for (const fixture of parsedFixtures(payload, comp)) {
          const original = existing.get(fixture.id);
          const at = Date.parse(fixture.startUtc);
          if (!original || at < from.getTime() - 86400000 || at >= until.getTime()) continue;
          if (fixture.broadcasts.length && JSON.stringify(fixture.broadcasts) !==
              JSON.stringify(original.broadcasts || [])) {
            original.broadcasts = fixture.broadcasts;
            changed++;
          }
        }
      } catch {
        // A partial ESPN outage must not erase a verified fixture or its
        // previously published channel assignment.
      }
      month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 1);
      await delay(70);
    }
  }
  if (!successfulMonths) throw new Error("Unable to refresh any sports broadcasts");
  // Daily broadcasts can change without changing fixture IDs. Refresh all
  // precomputed joins even when ESPN reports no new assignment.
  const games = previous.games.map(game => {
    const confirmed = withPublishedPrimeVideo(game);
    return { ...confirmed, drogonChannels: matchDrogonChannels(confirmed.broadcasts),
      drogonBroadcastKey: JSON.stringify(confirmed.broadcasts || []) };
  });
  return { ...previous, games, broadcastUpdatedAt: today.toISOString(),
    drogonLineupCapturedAt: DROGON_LINEUP_CAPTURED_AT,
    broadcastCoverage: { successfulMonths, changed } };
}
export async function run() {
  let previous = null;
  try { previous = decryptState(JSON.parse(fs.readFileSync(SPORTS_INDEX_PATH,"utf8"))); } catch {}
  const broadcastOnly = process.argv.includes("--broadcasts");
  const index = broadcastOnly
    ? await refreshUpcomingBroadcasts(fetch, new Date(), previous)
    : await indexSports(fetch, new Date(), previous);
  fs.mkdirSync("sports/state",{recursive:true});
  fs.writeFileSync(SPORTS_INDEX_PATH,JSON.stringify(encryptState(index))+"\n");
  console.log(`Published ${index.games.length} professional fixtures, ${index.teams.length} team options and verified broadcast updates.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
