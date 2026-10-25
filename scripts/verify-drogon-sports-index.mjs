/**
 * Notification-silent release gate for the encrypted annual professional
 * sports index. Reads the locally pulled encrypted sports snapshot only; no
 * provider queries, Web Push, writes or PWA work. Baseline: v11.8.0.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { decryptState, isHardenedStateEnvelope } from "../backend/shared/state-crypto.mjs";
import { COMPETITIONS, SPORTS_INDEX_PATH } from "../backend/sports/index.mjs";
import { DROGON_LINEUP_CAPTURED_AT, DROGON_CHANNELS, DROGON_TEST_CHANNELS,
  matchDrogonChannels } from "../backend/sports/drogon-lineup.mjs";

const encrypted = JSON.parse(fs.readFileSync(SPORTS_INDEX_PATH, "utf8"));
assert.ok(isHardenedStateEnvelope(encrypted), "sports snapshot must remain hardened AES-GCM");
const index = decryptState(encrypted);
assert.ok(index && Array.isArray(index.games) && Array.isArray(index.teams),
  "professional fixture index must have valid shape");
assert.equal(index.drogonLineupCapturedAt, DROGON_LINEUP_CAPTURED_AT,
  "the annual backfill must have included the current Drogon catalogue");
assert.ok(Number.isFinite(Date.parse(index.updatedAt)), "index updatedAt missing");
assert.ok(Number.isFinite(Date.parse(index.broadcastUpdatedAt)), "broadcastUpdatedAt missing");
assert.ok(index.games.length >= 300, "full-year fixture index unexpectedly small");
assert.ok(index.teams.length >= 150, "professional team options unexpectedly small");

const active = new Set(DROGON_CHANNELS);
const testing = new Set(DROGON_TEST_CHANNELS);
const counts = Object.fromEntries(COMPETITIONS.map(x => [x.code, 0]));
const uniqueIds = new Set();
const now = Date.now();
const horizon = now + 360 * 86400000;
let matched = 0;
let future = 0;
let longest = 0;
for (const game of index.games) {
  assert.ok(!uniqueIds.has(game.id), "duplicate indexed game ID");
  uniqueIds.add(game.id);
  assert.equal(game.kind, "watch", "sports index should contain only Watch events");
  const match = /^watch:([a-z0-9.]+):/.exec(game.id || "");
  assert.ok(match, "invalid source-qualified watch ID");
  if (Object.hasOwn(counts, match[1])) counts[match[1]]++;
  assert.ok(Array.isArray(game.broadcasts), "indexed broadcasters must be an array");
  assert.ok(Array.isArray(game.drogonChannels), "missing computed guide matches");
  assert.equal(game.drogonBroadcastKey, JSON.stringify(game.broadcasts),
    "channel suggestions must refer to current broadcasters");
  assert.deepEqual(game.drogonChannels, matchDrogonChannels(game.broadcasts),
    "computed suggestions must exactly match published broadcaster evidence");
  assert.ok(game.drogonChannels.every(ch => active.has(ch) && !testing.has(ch)),
    "TEST or unknown channels must never appear as recommendations");
  if (game.drogonChannels.length) matched++;
  const kickoff = Date.parse(game.startUtc);
  assert.ok(Number.isFinite(kickoff), "invalid UTC kickoff");
  if (kickoff >= now && kickoff < horizon) {
    future++;
    longest = Math.max(longest, kickoff);
  }
}
for (const comp of COMPETITIONS.filter(x => x.code === "nba" || x.group === "club")) {
  assert.ok(counts[comp.code] > 0, "essential competition missing: " + comp.code);
}
assert.ok(future >= 100, "upcoming fixture catalogue is unexpectedly small");
assert.ok(longest > now + 30 * 86400000, "upcoming fixtures are not indexed beyond 30 days");
assert.ok(matched > 0, "no evidence-based Drogon channel matches were indexed");
console.log(JSON.stringify({ verified: true, indexedGames: index.games.length,
  matchedWithDrogon: matched, upcomingGames: future, teams: index.teams.length,
  lineupDate: index.drogonLineupCapturedAt, competitionCounts: counts }));
