/**
 * Select the next individually published pickup session for the anonymous
 * RSVP name dropdown. Never enumerate historical/unpublished rosters or
 * store other players' names on the device. Baseline: v11.9.0.
 */
export function nextPublishedPickupDate(games, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) return "";
  const dates = (Array.isArray(games) ? games : [])
    .filter(game => game?.kind === "pickup")
    .map(game => String(game.sourceDate || game.date || ""))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today)
    .sort();
  return dates[0] || "";
}
