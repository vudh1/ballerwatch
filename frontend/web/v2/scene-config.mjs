/**
 * BallerWatch soccer choreography; deterministic reversible joints and projected ball flight.
 * Baseline: v11.2.0. No network, storage, physics engine or production data.
 * Coordinates refer to the 1440 × 900 scene; edit these controls to retime play.
 */
export const FEATURE_STORIES = Object.freeze([
  { start: 0, label: "PLAY OR WATCH", title: ["Every kickoff.", "One place."],
    description: "Play pickup and RATS league games, or follow NBA and world football. Separate matchday cards and schedules for both." },
  { start: 0.16, label: "BE MATCH-READY", title: ["Know before", "you go."],
    description: "Pickup RSVPs, waitlists, withdrawal requests, rain forecasts, field directions and easy match sharing." },
  { start: 0.32, label: "KNOW YOUR CLUB", title: ["The bigger", "picture."],
    description: "RATS standings, cross-division results, ten-game scouting, opponent form and matchup win probabilities." },
  { start: 0.48, label: "BALLERWATCH AI", title: ["Your game,", "explained."],
    description: "Ask about upcoming fixtures, opponents, tactics, jersey colors and results—with contextual follow-ups." },
  { start: 0.64, label: "STAY IN THE LOOP", title: ["The updates", "that matter."],
    description: "On-device inbox and Web Push updates for pickup availability, league schedule changes and releases." },
  { start: 0.80, label: "MAKE IT YOURS", title: ["Your teams.", "Your BallerWatch."],
    description: "Daily Watch match cards, local kickoff times, Vela TV calendar subscriptions, Home Screen access and device-only settings. No account needed." },
]);

export const SCENE = Object.freeze({
  launchMs: 2000,
  scrollScreens: 3.2,
  setupEnd: 0.15,
  backswingEnd: 0.245,
  contact: 0.30,
  followThroughEnd: 0.41,
  cameraStart: 0.28,
  cameraEnd: 0.78,
  flightEnd: 0.68,
  diveStart: 0.60,
  diveEnd: 0.78,
  revealStart: 0.92,
  stadiumAsset: "./assets/stadium.svg",
  keeper: { x: 1120, y: 570, travelX: 38, travelY: 44, rotation: 60 },
  ball: {
    start: { x: 477, y: 741 },
    lift: 58,
    curl: 12,
    corner: { x: 1260, y: 390 },
  },
});

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export function featureStory(value) {
  const progress = clamp(Number(value) || 0);
  let index = 0;
  while (index + 1 < FEATURE_STORIES.length && progress >= FEATURE_STORIES[index + 1].start) index += 1;
  return FEATURE_STORIES[index];
}

const mix = (start, end, progress) => start + (end - start) * progress;
const segment = (progress, start, end) => clamp((progress - start) / Math.max(0.00001, end - start));
const ease = (value) => value * value * (3 - 2 * value);

// Hermite tail: preserve entry speed, decelerate into the net without a
// velocity discontinuity. All coordinates depend on progress, never prior frames.
function flightTime(progress) {
  if (progress <= 0.85) return progress;
  const t = (progress - 0.85) / 0.15;
  return 0.85 + 0.15 * (t + t * t - t * t * t);
}

function projectile(t, ball) {
  const start = ball.start, target = ball.corner;
  // y increases downward. The parabolic lift corresponds to a downward
  // gravity-like acceleration in screen space; curl is a small lateral term.
  return {
    x: mix(start.x, target.x, t) + ball.curl * Math.sin(Math.PI * t),
    y: mix(start.y, target.y, t) - 4 * ball.lift * t * (1 - t),
  };
}

function traveledDistance(t, ball) {
  // Arc-length approximation is deterministic, bounded and inexpensive.
  let length = 0;
  let previous = projectile(0, ball);
  for (let step = 1; step <= 12; step += 1) {
    const next = projectile(t * step / 12, ball);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return length;
}

export function scenePose(value, settings = SCENE) {
  const progress = clamp(Number.isFinite(Number(value)) ? Number(value) : 0);
  const flight = flightTime(segment(progress, settings.contact, settings.flightEnd));
  const approach = ease(segment(progress, 0, settings.setupEnd));
  const backswing = ease(segment(progress, settings.setupEnd, settings.backswingEnd));
  const strike = ease(segment(progress, settings.backswingEnd, settings.contact));
  const follow = ease(segment(progress, settings.contact, settings.followThroughEnd));
  const shot = progress >= settings.contact;
  const diveRaw = segment(progress, settings.diveStart, settings.diveEnd);
  const dive = ease(diveRaw);
  const push = ease(segment(progress, settings.diveStart + 0.035, settings.diveEnd));
  const settle = ease(segment(progress, settings.diveEnd, settings.revealStart));
  const impact = segment(progress, settings.flightEnd, settings.revealStart);
  const netPulse = Math.sin(impact * Math.PI) * (1 - impact);
  const kick = progress < settings.setupEnd ? mix(12, 27, approach) :
    progress < settings.backswingEnd ? mix(27, 46, backswing) :
      progress < settings.contact ? mix(46, 0, strike) : mix(0, -32, follow);
  const knee = progress < settings.setupEnd ? mix(4, 9, approach) :
    progress < settings.backswingEnd ? mix(9, -27, backswing) :
      progress < settings.contact ? mix(-27, 0, strike) : mix(0, 14, follow);
  const phase = progress < settings.setupEnd ? 0 : progress < settings.contact ? 1 :
    progress < settings.diveStart ? 2 : progress < settings.diveEnd ? 3 :
      progress < settings.revealStart ? 4 : 5;
  const flyingBall = projectile(flight, settings.ball);
  return {
    progress, phase, kick, knee, dive, netPulse,
    player: {
      shiftX: mix(-9, 0, approach),
      bob: -3 * Math.sin(Math.PI * approach) * (1 - approach) + 2 * follow,
      torso: progress < settings.contact ? -5 * backswing + 5 * strike : 8 * follow,
      arms: progress < settings.contact ? -8 * backswing + 8 * strike : -7 * follow,
      plant: 11 * backswing * (1 - strike) + 5 * follow,
    },
    keeper: {
      x: settings.keeper.x + dive * settings.keeper.travelX,
      y: settings.keeper.y - dive * settings.keeper.travelY + 4 * (1 - settle) * diveRaw,
      rotation: dive * settings.keeper.rotation,
      load: 5 * ease(segment(progress, settings.diveStart, settings.diveStart + 0.07)) * (1 - dive),
      reach: 4 * push,
      landing: settle * dive,
    },
    ball: {
      x: flyingBall.x + (shot ? 5 * ease(impact) : 0),
      y: flyingBall.y + (shot ? 18 * ease(impact) : 0),
      scale: mix(1, 0.52, flight),
      rotation: shot ? traveledDistance(flight, settings.ball) / 20 * 180 / Math.PI : 0,
    },
    focus: mix(490, 1120, ease(segment(progress, settings.cameraStart, settings.cameraEnd))),
    reveal: ease(segment(progress, settings.revealStart, 1)),
    impactFlash: Math.max(0, 1 - Math.abs(progress - settings.contact) / 0.025) * 0.12,
    grass: Math.max(0, 1 - Math.abs(progress - (settings.contact + 0.025)) / 0.045),
  };
}

// Localized camera pops follow scroll and reverse exactly; no looping strobes.
export function cameraFlash(progress, index) {
  const moments = [0.22, 0.40, 0.55, 0.69, 0.78, 0.87];
  const distance = Math.abs(clamp(Number(progress) || 0) - moments[index]);
  return Math.max(0, 1 - distance / 0.018) ** 2 * 0.8;
}
