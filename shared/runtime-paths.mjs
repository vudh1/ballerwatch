/**
 * Canonical runtime-file scopes shared by GitHub workflows and the BallerWatch web Worker.
 *
 * Documentation baseline: v2.4.0. Keeping this list in one module prevents state-path drift.
 */

export const RUNTIME_SCOPES = Object.freeze({
  user: Object.freeze([
    "state/user.json",
    "state/chat-history.json",
    "state/chat-review.json",
    "league/state/teams.json",
    "pickup/state/feed.json",
    "pickup/state/events.json",
    "league/state/schedule.json",
    "league/state/today.json",
    "requests/private.json",
    "requests/unknown.json",
    "state/web-push.json",
  ]),
  pickup: Object.freeze([
    "state/user.json",
    "pickup/state/feed.json",
    "pickup/state/events.json",
    "pickup/state/notify.json",
    "pickup/state/source-health.json",
    "state/web-push.json",
    "state/web-board-pickup.json",
  ]),
  league: Object.freeze([
    "state/user.json",
    "league/state/teams.json",
    "league/state/schedule.json",
    "league/state/today.json",
    "league/state/calendar-snapshot.json",
    "league/state/edge-signal.json",
    "league/state/notify.json",
    "state/web-push.json",
    "state/web-board-league.json",
  ]),
  watchdog: Object.freeze([
    "state/watchdog.json",
    "state/web-push.json",
    "state/web-board-version.json",
  ]),
  weather: Object.freeze([
    "pickup/state/feed.json",
    "pickup/state/events.json",
    "league/state/schedule.json",
    "state/weather.json",
  ]),
  web: Object.freeze([
    "state/web-push.json",
    "state/web-board-pickup.json",
    "state/web-board-league.json",
    "state/web-board-version.json",
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
