/**
 * User's three watch sources: Prime Video, ESPN and DrogonTV.
 * ESPN publishes the actual U.S. broadcasters. DrogonTV's public page lists
 * channel names but has no verified per-event EPG: always say "check guide".
 * Never infer a channel from day-of-week league broadcast patterns.
 */
const DIRECT = new Map([
  ["Prime Video", "Prime Video"],
  ["ESPN", "ESPN"],
]);
const DROGON_GUIDE = new Set([
  "ESPN", "FOX Sports", "NBC Sports", "beIN SPORTS", "NBA TV", "TNT",
]);
export function watchCoverage(game) {
  const sources = Array.isArray(game?.broadcasts)
    ? [...new Set(game.broadcasts.filter(name =>
      typeof name === "string" && name.length <= 40))] : [];
  if (!sources.length) return "TV channel not announced";
  const available = [];
  for (const channel of sources) {
    if (DIRECT.has(channel)) available.push(DIRECT.get(channel));
  }
  // Channel presence on an advertised IPTV lineup does not verify the IPTV
  // platform has this particular program, or that it is licensed in the U.S.
  if (available.length < 2) {
    const guideChannel = sources.find(name => DROGON_GUIDE.has(name) &&
      !DIRECT.has(name));
    if (guideChannel) available.push(`${guideChannel} · check DrogonTV guide`);
  }
  if (available.length) return available.slice(0, 2).join(" · ");
  // NBC/Peacock, CBS/Paramount+, Apple TV, etc. are omitted because the user
  // did not say they have those subscriptions. Do not promise IPTV access.
  return "No confirmed channel on your services";
}
