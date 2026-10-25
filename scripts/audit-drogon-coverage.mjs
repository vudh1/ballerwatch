/**
 * Read-only evidence audit of scheduled ESPN U.S. broadcasts vs the static
 * user-supplied Drogon channel list. Network only: never reads/writes runtime
 * state, credentials or subscriptions. Intended for a one-off CI audit.
 */
import { COMPETITIONS, parsedFixtures } from "../backend/sports/index.mjs";
import { DROGON_CHANNELS, DROGON_TEST_CHANNELS, matchDrogonChannels } from "../backend/sports/drogon-lineup.mjs";

const now = new Date();
const days = 28;
const start = now.getTime();
const end = start + days * 86400000;
const firstMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
const lastDay = new Date(end);
const lastMonth = Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), 1);
const months = [];
for (let stamp = firstMonth; stamp <= lastMonth;) {
  const d = new Date(stamp);
  months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}`);
  stamp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 1);
}
const keys = COMPETITIONS.flatMap(comp => months.map(month => ({ comp, month })));
let cursor = 0;
const fetchFailures = [];
const games = new Map();
let successfulRequests = 0;
async function reader() {
  while (cursor < keys.length) {
    const { comp, month } = keys[cursor++];
    const url = `https://site.api.espn.com/apis/site/v2/sports/${comp.sport}/${comp.code}/scoreboard?dates=${month}&limit=1000`;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "BallerWatch-public-readonly-coverage-audit" },
        signal: AbortSignal.timeout(14000),
      });
      if (!res.ok) throw Error("HTTP " + res.status);
      const body = await res.text();
      if (body.length > 4_000_000) throw Error("response too large");
      const data = JSON.parse(body);
      const parsed = parsedFixtures(data, comp);
      if (parsed.length >= 1000) throw Error("scoreboard cap reached");
      successfulRequests++;
      for (const game of parsed) {
        const kickoff = Date.parse(game.startUtc);
        if (kickoff >= start && kickoff < end) games.set(game.id, game);
      }
    } catch (err) {
      fetchFailures.push({ competition: comp.code, month, error: String(err.message).slice(0, 95) });
    }
  }
}
await Promise.all(Array.from({ length: 3 }, () => reader()));
const tally = { total: 0, withPublishedBroadcasters: 0, withDrogonChannelMatch: 0,
  withPublishedButNoDrogonMatch: 0, noPublishedBroadcasters: 0 };
const leagues = {};
const channelCounts = {};
const sourcesNotListed = {};
const examples = [];
const missingExamples = [];
for (const game of games.values()) {
  const group = game.competition || "Other";
  const entry = leagues[group] ||= { total: 0, withPublishedBroadcasters: 0, withDrogonChannelMatch: 0 };
  entry.total++; tally.total++;
  if (game.broadcasts.length) {
    tally.withPublishedBroadcasters++; entry.withPublishedBroadcasters++;
    const matches = matchDrogonChannels(game.broadcasts);
    if (matches.length) {
      tally.withDrogonChannelMatch++; entry.withDrogonChannelMatch++;
      for (const name of matches) channelCounts[name] = (channelCounts[name] || 0) + 1;
      if (examples.length < 10) examples.push({ game: game.title, kickoffUtc: game.startUtc,
        publishedUS: game.broadcasts, listedDrogonChannel: matches });
    } else {
      tally.withPublishedButNoDrogonMatch++;
      for (const name of game.broadcasts) sourcesNotListed[name] = (sourcesNotListed[name] || 0) + 1;
      if (missingExamples.length < 5) missingExamples.push({game: game.title,
        kickoffUtc: game.startUtc, publishedUS: game.broadcasts });
    }
  } else tally.noPublishedBroadcasters++;
}
function percent(n, d) { return d ? +(100*n/d).toFixed(1) : null; }
const report = {
  category: "read-only ESPN public scoreboard audit",
  capturedAtUtc: now.toISOString(), windowDays: days,
  throughUtcExclusive: new Date(end).toISOString(),
  providerRequests: keys.length, successfulRequests, fetchFailures,
  drogonRegularChannelCount: DROGON_CHANNELS.length,
  drogonTestChannelCountExcluded: DROGON_TEST_CHANNELS.length,
  ...tally,
  percentAllGamesWithChannelMatch: percent(tally.withDrogonChannelMatch, tally.total),
  percentPublishedBroadcasterGamesWithChannelMatch: percent(
    tally.withDrogonChannelMatch, tally.withPublishedBroadcasters),
  leagues, channelCounts, publishedNotListed: sourcesNotListed, examples, missingExamples,
  caveat: "Exact provider-published U.S. broadcaster name also occurs in the captured Drogon channel list. Does NOT confirm the specific program plays in that IPTV feed or that it is licensed/available.",
};
console.log("DROGON_COVERAGE_AUDIT_JSON_BEGIN");
console.log(JSON.stringify(report, null, 2));
console.log("DROGON_COVERAGE_AUDIT_JSON_END");
