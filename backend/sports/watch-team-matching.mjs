/**
 * Public Watching selection matching across domestic and European club cups, including EFL Cup.
 * Existing device/ICS choices keep their legacy league-prefixed labels; an
 * exact club name can match fixtures in another indexed club competition.
 * NBA and national-team choices remain isolated. No private data is stored.
 */
const CLUB_COMPETITIONS = new Set([
  "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
  "UEFA Champions League", "UEFA Europa League", "EFL Cup",
]);
const normalized = value => String(value || "").normalize("NFKC").trim()
  .replace(/\s+/g, " ").toLowerCase();

/** Preserve namespaces: a country or NBA team cannot alias a soccer club. */
export function watchingTeamKey(label) {
  const text = normalized(label);
  const divider = text.indexOf(" · ");
  if (divider < 0) return "exact:" + text;
  const competition = text.slice(0, divider);
  const club = text.slice(divider + 3);
  if (club && [...CLUB_COMPETITIONS].some(name => name.toLowerCase() === competition)) {
    return "club:" + club;
  }
  return "exact:" + text;
}

/** Use only published catalogue selections, never unverified arbitrary names. */
export function watchedFixtures(index, selected, now = Date.now()) {
  if (!Array.isArray(index?.games) || !Array.isArray(selected) || !selected.length) return [];
  const allowed = new Set((index.teams || []).map(watchingTeamKey));
  const wanted = new Set(selected.map(watchingTeamKey).filter(key => allowed.has(key)));
  if (!wanted.size) return [];
  const cutoff = now - 3 * 3600_000;
  return index.games.filter(game =>
    game.kind === "watch" && Array.isArray(game.teams) &&
    game.teams.some(team => wanted.has(watchingTeamKey(team))) &&
    Date.parse(game.startUtc) >= cutoff).slice(0, 450);
}
