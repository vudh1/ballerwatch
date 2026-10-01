/**
 * Canonical runtime-file scopes shared by GitHub workflows and the Cloudflare Worker.
 *
 * Documentation baseline: v2.3.0. Keeping this list in one module prevents state-path drift.
 */

export const RUNTIME_SCOPES = Object.freeze({
  listener: Object.freeze([
    "state/listener.json",
    "league/state/teams.json",
    "pickup/state/feed.json",
    "pickup/state/events.json",
    "league/state/schedule.json",
    "league/state/today.json",
    "requests/private.json",
    "requests/unknown.json",
  ]),
  pickup: Object.freeze([
    "state/listener.json",
    "pickup/state/feed.json",
    "pickup/state/events.json",
    "pickup/state/notify.json",
    "pickup/state/source-health.json",
  ]),
  league: Object.freeze([
    "league/state/teams.json",
    "league/state/schedule.json",
    "league/state/today.json",
    "league/state/calendar-snapshot.json",
    "league/state/edge-signal.json",
  ]),
  watchdog: Object.freeze([
    "state/watchdog.json",
  ]),
});

export const ALL_RUNTIME_FILE_PATHS = Object.freeze(
  [...new Set(Object.values(RUNTIME_SCOPES).flat())],
);

export function runtimePathsFor(scope) {
  const paths = RUNTIME_SCOPES[scope];
  if (!paths) throw new Error(`Unknown runtime-state scope: ${scope}`);
  return [...paths];
}
