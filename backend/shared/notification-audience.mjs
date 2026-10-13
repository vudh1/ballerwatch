/**
 * Decides which signed-in devices need a public-safe pickup notification.
 *
 * RSVP names are consulted only inside the encrypted Actions runtime. They are
 * never written to the public notification board, push payload, or logs.
 */
function normalizedName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function pickupNotificationAudience(entry, subscription, settings = {}, privateEvents = {}) {
  const tag = String(entry?.tag || "");
  const reminder = tag.match(/^pickup-rsvp-reminder-(\d{4}-\d{2}-\d{2})$/);
  const capacity = tag.match(/^pickup-capacity-(\d{4}-\d{2}-\d{2})-\d+$/);
  if (!reminder && !capacity) return true;

  const username = normalizedName(subscription?.userId);
  if (!username) return true; // Anonymous subscription: never assume a booking.
  const configuredName = username === "admin"
    ? settings?.ownerRsvpName
    : settings?.webUsers?.[username]?.rsvpName;
  const rsvpName = normalizedName(configuredName);
  if (!rsvpName) return true;

  const sourceDate = (reminder || capacity)[1];
  const event = privateEvents?.[sourceDate];
  if (!event || !Array.isArray(event.players) || !Array.isArray(event.waitlist)) {
    return true; // Do not infer RSVP from an unavailable roster.
  }
  const includesName = (entries) => entries.some((person) =>
    normalizedName(person?.name) === rsvpName
  );
  if (includesName(event.players)) return false; // Confirmed: no RSVP/capacity nags.
  if (reminder && includesName(event.waitlist)) return false; // Already waitlisted.
  return true;
}
