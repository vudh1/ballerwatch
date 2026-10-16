/**
 * Accountless device RSVP targeting using a private HMAC membership index.
 * No player names, membership results, identities or roster order are sent
 * to the browser, a Web Push endpoint, or the public notification board.
 */
export function pickupNotificationAudience(entry, subscription, index = null) {
  const tag = String(entry?.tag || "");
  const reminder = tag.match(/^pickup-rsvp-reminder-(\d{4}-\d{2}-\d{2})$/);
  const capacity = tag.match(/^pickup-capacity-(\d{4}-\d{2}-\d{2})-\d+$/);
  if (!reminder && !capacity) return true;
  const rsvpTag = String(subscription?.rsvpTag || "");
  if (!/^[a-f0-9]{64}$/.test(rsvpTag)) return true;
  const day = index?.dates?.[(reminder || capacity)[1]];
  if (!day) return true; // Unavailable roster must not suppress a real reminder.
  if ((day.confirmed || []).includes(rsvpTag)) return false;
  if (reminder && (day.waitlisted || []).includes(rsvpTag)) return false;
  return true;
}

function teamKey(name) {
  return String(name || "").trim().replace(/\s+/g," ").toLocaleLowerCase("en");
}

export function leagueNotificationAudience(entry, subscription) {
  const teams = Array.isArray(subscription?.teams) ? subscription.teams : [];
  const matchTeams = Array.isArray(entry?.teams) ? entry.teams : [];
  // Empty means use global default feeds, never unsubscribe a device silently.
  if (!teams.length || !matchTeams.length) return true;
  const followed = new Set(teams.map(teamKey));
  return matchTeams.some(team => followed.has(teamKey(team)));
}
