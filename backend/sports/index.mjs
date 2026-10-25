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
export function parsedTeams(payload, comp) {
  const leagues = (payload?.sports || []).flatMap(s => s?.leagues || []);
  const items = leagues.flatMap(l => l?.teams || []);
  return [...new Set(items.map(t => teamLabel(comp, t?.team?.displayName || t?.displayName)).filter(Boolean))];
}
export function parsedFixtures(payload, comp) {
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
      teams: [teamLabel(comp, first), teamLabel(comp, second)],
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
export async function indexSports(fetcher = fetch, today = new Date(), previous = null) {
  const from = startOfDay(today);
  const until = new Date(from.getTime() + 126 * 86400000);
  const catalogue = new Set(NATIONAL_OPTIONS), fixtureMap = new Map();
  const failures = [];
  for (const comp of COMPETITIONS) {
    try {
      const response = await getJson(fetcher, apiUrl(comp, "teams", "?limit=500"));
      for (const option of parsedTeams(response, comp)) catalogue.add(option);
    } catch { failures.push(comp.code + ":teams"); }
    // Small, bounded 6-week chunks avoid provider pagination truncation.
    let successfulWindows = 0;
    for (let start = from; start < until; start = new Date(start.getTime() + 42*86400000)) {
      const end = new Date(Math.min(until.getTime(), start.getTime() + 41*86400000));
      try {
        const response = await getJson(fetcher, apiUrl(comp, "scoreboard",
          `?dates=${rangeDay(start)}-${rangeDay(end)}&limit=1000`));
        successfulWindows++;
        for (const fixture of parsedFixtures(response, comp)) {
          if (Date.parse(fixture.startUtc) >= from.getTime() - 86400000) {
            fixtureMap.set(fixture.id, fixture);
            fixture.teams.forEach(t => catalogue.add(t));
          }
        }
      } catch { failures.push(comp.code + ":scoreboard"); }
      await delay(180);
    }
    // Keep the previous verified fixtures for a competition if ESPN fails
    // all its windows, rather than silently erasing the calendar.
    if (!successfulWindows && Array.isArray(previous?.games)) {
      for (const old of previous.games.filter(g => String(g.id).startsWith("watch:"+comp.code+":")
          && Date.parse(g.startUtc) >= from.getTime()-86400000)) {
        if (!fixtureMap.has(old.id)) fixtureMap.set(old.id, old);
      }
    }
  }
  for (const option of previous?.teams || []) catalogue.add(option);
  // Do not publish an all-empty index after total upstream failure.
  if (!fixtureMap.size && !previous?.games?.length) throw new Error("No verified sport fixtures");
  const games = [...fixtureMap.values()].sort((a,b)=>a.startUtc.localeCompare(b.startUtc))
    .slice(0, 6000);
  return { updatedAt: today.toISOString(), provider: "ESPN public site feeds (unofficial)",
    refreshHours: 168, teams: [...catalogue].sort((a,b)=>a.localeCompare(b)).slice(0, 700),
    games, failures };
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
