/**
 * Presentation-only partition between personal matches and professional fixtures.
 * Never carry RSVP, scouting, standings or local match-edit behavior into Watch.
 */
export const PLAY = "play";
export const WATCH = "watch";

export function modeGames(mode, personalGames = [], watchedGames = []) {
  const source = mode === WATCH ? watchedGames : personalGames;
  return (Array.isArray(source) ? source : [])
    .filter(game => game && typeof game.id === "string" &&
      (mode === WATCH ? game.kind === "watch" : game.kind !== "watch"))
    .slice()
    .sort((a, b) => String(a.startUtc || a.date || "").localeCompare(
      String(b.startUtc || b.date || "")) || String(a.id).localeCompare(String(b.id)));
}

export function watchMatchDetails(game) {
  if (!game || game.kind !== WATCH) return null;
  const kickoff = Date.parse(game.startUtc);
  const time = Number.isFinite(kickoff)
    ? new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", weekday: "short", month: "short",
      day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(new Date(kickoff)) + " PT"
    : String(game.date || "Date pending");
  return {
    title: String(game.title || "Professional match"),
    competition: String(game.competition || (game.sport === "basketball" ? "NBA" : "Football")),
    time,
    location: String(game.location || "Venue not announced"),
  };
}
