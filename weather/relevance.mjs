/**
 * Identifies pickup changes that can alter match-weather lookup.
 *
 * RSVP counts and rosters are intentionally excluded so weather is not refreshed
 * on every 2-minute pickup watcher run.
 */
function clean(value, max = 240) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function pickupWeatherSignature(feed = {}, privateState = {}) {
  const publicEvents = feed?.events && typeof feed.events === "object" ? feed.events : {};
  const privateEvents =
    privateState?.events && typeof privateState.events === "object"
      ? privateState.events
      : {};
  const dates = [...new Set([
    ...Object.keys(publicEvents),
    ...Object.keys(privateEvents),
  ])].sort();

  return dates.map((date) => {
    const pub = publicEvents[date] || {};
    const priv = privateEvents[date] || {};
    return {
      date: clean(date, 20),
      startTime: clean(pub.startTime, 40),
      endTime: clean(pub.endTime, 40),
      fieldName: clean(priv.fieldName, 180),
      address: clean(priv.address, 220),
    };
  });
}

export function pickupWeatherChanged(
  previousFeed,
  previousPrivate,
  nextFeed,
  nextPrivate,
) {
  return JSON.stringify(pickupWeatherSignature(previousFeed, previousPrivate)) !==
    JSON.stringify(pickupWeatherSignature(nextFeed, nextPrivate));
}
