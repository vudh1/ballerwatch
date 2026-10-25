/**
 * Names from ESPN's public U.S. scoreboard feed, never guessed from a game's
 * day of week or a competition's general rights. This is a cautious allowlist:
 * do not display overseas broadcasters or present IPTV inventory as verified.
 */
const CHANNELS = new Map(Object.entries({
  "prime video": "Prime Video", "amazon prime video": "Prime Video",
  "amazon prime": "Prime Video", "prime": "Prime Video",
  "espn": "ESPN", "espn2": "ESPN2", "espnu": "ESPNU",
  "espnews": "ESPNEWS", "espn deportes": "ESPN Deportes",
  "espn+": "ESPN+", "espn plus": "ESPN+",
  "abc": "ABC", "nba tv": "NBA TV", "nbatv": "NBA TV",
  "tnt": "TNT", "tnt sports": "TNT",
  "tbs": "TBS", "nbc": "NBC", "nbc sports": "NBC Sports",
  "usa": "USA Network", "usa network": "USA Network",
  "fox": "FOX", "fox sports": "FOX Sports", "fs1": "FS1", "fs2": "FS2",
  "cbs": "CBS", "cbs sports network": "CBS Sports Network",
  "bein sports": "beIN SPORTS", "peacock": "Peacock",
  "paramount+": "Paramount+", "paramount plus": "Paramount+",
  "telemundo": "Telemundo", "univision": "Univision", "tudn": "TUDN",
  "universo": "Universo", "apple tv": "Apple TV", "mls season pass": "MLS Season Pass",
}));
// 2026–27 U.S. domestic league rights: reject ESPN's other-country
// scoreboard labels when they conflict with the verified U.S. carrier.
const LEAGUE_CHANNELS = new Map([
  ["nba", new Set(["ESPN","ABC","Prime Video","NBC","Peacock","NBA TV"])],
  ["eng.1", new Set(["NBC","USA Network","Peacock","Telemundo","Universo"])],
  ["esp.1", new Set(["ABC","ESPN","ESPN2","ESPN+","ESPN Deportes"])],
  ["ger.1", new Set(["USA Network","Peacock","Telemundo","Universo"])],
  ["ita.1", new Set(["CBS","CBS Sports Network","Paramount+",
    "Peacock","Telemundo","Universo"])],
  ["fra.1", new Set(["beIN SPORTS"])],
]);
const norm = name => String(name || "").trim().toLowerCase()
  .replace(/\s+/g, " ").replace(/[®™]/g, "");
function usOrUnspecified(entry) {
  const country = String(entry?.country?.code || entry?.country?.abbreviation ||
    entry?.countryCode || entry?.country || entry?.region?.code || "").toUpperCase();
  if (country && !["US", "USA", "UNITED STATES"].includes(country)) return false;
  const market = entry?.market;
  const region = String(market?.country?.code || market?.countryCode || "").toUpperCase();
  return !region || ["US", "USA"].includes(region);
}
function names(input) {
  if (typeof input === "string") return [input];
  if (!input || typeof input !== "object") return [];
  if (Array.isArray(input)) return input.flatMap(names);
  return [
    ...(Array.isArray(input.names) ? input.names : []),
    input.shortName, input.name, input.displayName,
    input.media?.shortName, input.media?.longName,
  ].filter(x => typeof x === "string");
}
export function publishedUsBroadcasts(event, competitionInfo = null) {
  const competition = event?.competitions?.[0] || {};
  const entries = [
    ...(Array.isArray(competition.broadcasts) ? competition.broadcasts : []),
    ...(Array.isArray(event?.broadcasts) ? event.broadcasts : []),
    ...Object.values(competition.geoBroadcasts || {}).flatMap(value =>
      Array.isArray(value) ? value : [value]),
  ];
  // A scalar broadcast is sometimes present in the U.S. ESPN event contract.
  if (typeof competition.broadcast === "string") entries.push(competition.broadcast);
  if (typeof event?.broadcast === "string") entries.push(event.broadcast);
  const result = [];
  for (const entry of entries) {
    if (entry && typeof entry === "object" && !usOrUnspecified(entry)) continue;
    for (const name of names(entry)) {
      const channel = CHANNELS.get(norm(name));
      const permitted = LEAGUE_CHANNELS.get(competitionInfo?.code);
      if (permitted && !permitted.has(channel)) continue;
      if (channel === "Prime Video" && competitionInfo?.sport &&
          competitionInfo.sport !== "basketball") continue;
      if (channel && !result.includes(channel)) result.push(channel);
    }
  }
  return result.slice(0, 6);
}
