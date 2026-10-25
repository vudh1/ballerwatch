/**
 * Provider-confirmed 2026–27 NBA games carried by Prime Video (U.S.).
 * NBA's published schedule is preindexed in GitHub Actions; no browser
 * requests, guessed weekday rights, subscription verification, or API keys.
 * Source: https://www.nba.com/news/every-nba-game-on-prime-video-in-2026-27
 * Updated: 2026-09-22. Unknown/playoff TBD games require fresh evidence.
 */
const TEAM_IDS = Object.freeze({
  "atlanta hawks": "ATL", "boston celtics": "BOS", "brooklyn nets": "BKN",
  "charlotte hornets": "CHA", "chicago bulls": "CHI", "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL", "denver nuggets": "DEN", "detroit pistons": "DET",
  "golden state warriors": "GSW", "houston rockets": "HOU", "indiana pacers": "IND",
  "la clippers": "LAC", "los angeles clippers": "LAC",
  "la lakers": "LAL", "los angeles lakers": "LAL",
  "memphis grizzlies": "MEM", "miami heat": "MIA", "milwaukee bucks": "MIL",
  "minnesota timberwolves": "MIN", "new orleans pelicans": "NOP",
  "new york knicks": "NYK", "oklahoma city thunder": "OKC",
  "orlando magic": "ORL", "philadelphia 76ers": "PHI",
  "phoenix suns": "PHX", "portland trail blazers": "POR",
  "sacramento kings": "SAC", "san antonio spurs": "SAS",
  "toronto raptors": "TOR", "utah jazz": "UTA", "washington wizards": "WAS",
});
const MATCHUPS = Object.freeze([
  // Official NBA published regular-season Prime Video schedule, date in ET.
  ["2026-10-23", "NYK", "BOS"], ["2026-10-23", "HOU", "SAS"],
  ["2026-10-30", "NYK", "PHI"], ["2026-10-30", "LAL", "GSW"],
  ["2026-11-06", "PHI", "CLE"], ["2026-11-06", "POR", "LAL"],
  ["2026-11-13", "NYK", "IND"], ["2026-11-13", "GSW", "SAS"],
  ["2026-11-20", "TOR", "DET"], ["2026-11-20", "HOU", "DEN"],
  ["2026-11-27", "MIA", "NYK"], ["2026-11-27", "LAL", "SAS"],
  ["2026-12-18", "LAC", "MIA"],
  ["2026-12-23", "HOU", "PHI"], ["2026-12-23", "DEN", "LAL"],
  ["2026-12-31", "DEN", "MIN"],
  ["2027-01-07", "MIN", "TOR"], ["2027-01-07", "BOS", "LAL"],
  ["2027-01-14", "NOP", "SAS"], ["2027-01-17", "SAS", "NOP"],
  ["2027-01-21", "PHI", "BOS"], ["2027-01-21", "LAL", "GSW"],
  ["2027-01-28", "ATL", "NYK"], ["2027-01-28", "MIA", "MIL"],
  ["2027-02-04", "BOS", "CHA"], ["2027-02-04", "DAL", "DEN"],
  ["2027-02-05", "DET", "PHI"], ["2027-02-05", "IND", "OKC"],
  ["2027-02-06", "MIA", "MIN"], ["2027-02-06", "POR", "MEM"],
  ["2027-02-11", "NYK", "PHI"], ["2027-02-11", "SAS", "OKC"],
  ["2027-02-12", "MIN", "BOS"],
  ["2027-02-13", "DAL", "CHA"], ["2027-02-13", "PHI", "OKC"],
  ["2027-02-18", "SAS", "MIN"], ["2027-02-18", "HOU", "LAL"],
  ["2027-02-25", "OKC", "NYK"], ["2027-02-25", "DAL", "GSW"],
  ["2027-02-27", "WAS", "UTA"], ["2027-02-27", "OKC", "DET"],
  ["2027-03-04", "LAL", "PHI"], ["2027-03-04", "NYK", "DAL"],
  ["2027-03-06", "IND", "MIA"], ["2027-03-06", "ATL", "CLE"],
  ["2027-03-11", "PHI", "SAS"], ["2027-03-11", "NYK", "LAL"],
  ["2027-03-12", "OKC", "BOS"], ["2027-03-12", "GSW", "DEN"],
  ["2027-03-13", "ORL", "ATL"], ["2027-03-13", "IND", "HOU"],
  ["2027-03-27", "SAS", "DET"],
  ["2027-04-01", "BOS", "CLE"], ["2027-04-01", "LAL", "OKC"],
  ["2027-04-02", "GSW", "MIN"], ["2027-04-02", "DEN", "PHX"],
  ["2027-04-08", "PHI", "MIA"], ["2027-04-08", "GSW", "OKC"],
  ["2027-04-09", "DET", "NYK"], ["2027-04-09", "DEN", "SAS"],
]);
const sourceKeys = new Set(MATCHUPS.map(([day, a, b]) =>
  [day, ...[a, b].sort()].join(":")));
const easternDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

export function confirmedPrimeVideoNba(game) {
  if (game?.sport !== "basketball" || game?.competition !== "NBA" ||
      !Array.isArray(game.teams) || game.teams.length !== 2) return false;
  const kickoff = new Date(game.startUtc);
  if (!Number.isFinite(kickoff.getTime())) return false;
  const teams = game.teams.map(label =>
    TEAM_IDS[String(label).replace(/^NBA · /, "").toLowerCase().trim()]);
  if (teams.some(team => !team) || teams[0] === teams[1]) return false;
  const parts = easternDay.formatToParts(kickoff);
  const value = name => parts.find(part => part.type === name)?.value || "";
  const day = [value("year"), value("month"), value("day")].join("-");
  return sourceKeys.has([day, ...teams.sort()].join(":"));
}

export function withPublishedPrimeVideo(game) {
  const channels = Array.isArray(game?.broadcasts) ? game.broadcasts : [];
  if (!confirmedPrimeVideoNba(game) || channels.includes("Prime Video")) return game;
  return { ...game, broadcasts: [...channels, "Prime Video"] };
}
