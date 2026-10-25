/**
 * Display-only coverage from ESPN-published U.S. channels and precomputed
 * DrogonTV channel-lineup intersections. No client-side catalogue, provider
 * search, EPG inference or extra requests during startup. Baseline: v11.8.0.
 * A matched channel is NOT verified program availability: check the TV guide.
 */
const DIRECT = new Map([
  ["Prime Video", "Prime Video"],
  ["ESPN", "ESPN"],
]);
export const DEFAULT_WATCH_SERVICES = Object.freeze({ prime: true, espn: true, drogon: true });
export function watchCoverage(game, services = DEFAULT_WATCH_SERVICES) {
  const sources = Array.isArray(game?.broadcasts)
    ? [...new Set(game.broadcasts.filter(name =>
      typeof name === "string" && name.length <= 40))] : [];
  if (!sources.length) return "";
  const available = [];
  for (const channel of sources) {
    if (DIRECT.has(channel) && (channel === "Prime Video" ? services.prime !== false : services.espn !== false)) {
      available.push(DIRECT.get(channel));
    }
  }
  // An older production refresh may update broadcasts without updating new
  // precomputed fields. Fail closed rather than suggesting a stale channel.
  const lineupCurrent = !game?.drogonBroadcastKey ||
    game.drogonBroadcastKey === JSON.stringify(game.broadcasts);
  const lineupMatches = lineupCurrent && Array.isArray(game?.drogonChannels)
    ? [...new Set(game.drogonChannels.filter(name =>
      typeof name === "string" && name.length <= 50))] : [];
  if (services.drogon !== false && lineupMatches.length && available.length < 2) {
    const alternative = lineupMatches.find(name => !available.includes(name));
    if (alternative) available.push(`${alternative} · check DrogonTV guide`);
    else if (available.length === 1 && lineupMatches.includes(available[0])) {
      // Explain how to find the same published ESPN broadcast in the user's
      // Drogon channel inventory without presenting it as a confirmed airing.
      available[0] += " · check DrogonTV guide";
    }
  }
  // No unverified program guesses for UK/NZ feeds or ESPN+/Peacock/Paramount+.
  return available.slice(0, 2).join(" · ");
}
