/**
 * Original V2 soccer choreography; pure reversible poses from normalized scroll.
 * Baseline: v8.10.0. No network, storage, physics engine or production data.
 * Coordinates refer to the 1440 × 900 scene; edit these controls to retime play.
 */
export const FEATURE_STORIES = Object.freeze([
  { start: 0, label: "YOUR MATCHDAY", title: ["Every kickoff.", "One place."],
    description: "Pickup and league matches, your next game and a calendar built around the teams you follow." },
  { start: 0.16, label: "BE MATCH-READY", title: ["Know before", "you go."],
    description: "RSVP capacity and rosters, match weather, venues, directions and quick field sharing." },
  { start: 0.32, label: "KNOW YOUR CLUB", title: ["The bigger", "picture."],
    description: "League standings, opponent scouting, match history, recent form and win forecasts." },
  { start: 0.48, label: "BALLERWATCH AI", title: ["Your game,", "explained."],
    description: "Ask about fixtures, opponents, jersey colors, fields and results, with follow-up questions." },
  { start: 0.64, label: "STAY IN THE LOOP", title: ["The updates", "that matter."],
    description: "Inbox filters, Web Push reminders, unread badges and personal notification preferences. Real schedule changes sync to Google Calendar." },
  { start: 0.80, label: "MAKE IT YOURS", title: ["Your teams.", "Your BallerWatch."],
    description: "Your name and teams, optional music, V1/V2 layouts, Home Screen/offline access, secure accounts and authorized match administration." },
]);

export const SCENE = Object.freeze({
  launchMs: 2000,
  scrollScreens: 3.2,
  setupEnd: 0.15,
  contact: 0.30,
  followThroughEnd: 0.41,
  cameraStart: 0.28,
  cameraEnd: 0.78,
  flightEnd: 0.84,
  diveStart: 0.60,
  diveEnd: 0.80,
  revealStart: 0.92,
  stadiumAsset: "./assets/stadium.svg",
  keeper: { x: 1120, y: 570, travelX: 56, travelY: 72, rotation: 64 },
  ball: {
    start: { x: 477, y: 741 },
    control: { x: 875, y: 125 },
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
const segment = (progress, start, end) => clamp((progress - start) / (end - start));
const ease = (value) => value * value * (3 - 2 * value);

export function scenePose(value, settings = SCENE) {
  const progress = clamp(Number(value) || 0);
  const flight = segment(progress, settings.contact, settings.flightEnd);
  const curve = settings.ball;
  const a = (1 - flight) ** 2;
  const b = 2 * (1 - flight) * flight;
  const c = flight ** 2;
  const dive = ease(segment(progress, settings.diveStart, settings.diveEnd));
  const impact = segment(progress, settings.flightEnd, settings.revealStart);
  const netPulse = Math.sin(impact * Math.PI) * (1 - impact);
  const kick = progress < settings.setupEnd ? mix(32, 48, ease(progress / settings.setupEnd)) :
    progress < settings.contact ? mix(48, 0, ease(segment(progress, settings.setupEnd, settings.contact))) :
      mix(0, -42, ease(segment(progress, settings.contact, settings.followThroughEnd)));
  const phase = progress < settings.setupEnd ? 0 : progress < settings.contact ? 1 :
    progress < settings.diveStart ? 2 : progress < settings.diveEnd ? 3 :
      progress < settings.revealStart ? 4 : 5;
  return {
    progress, phase, kick, dive, netPulse,
    keeper: {
      x: settings.keeper.x + dive * settings.keeper.travelX,
      y: settings.keeper.y - dive * settings.keeper.travelY,
      rotation: dive * settings.keeper.rotation,
    },
    ball: {
      x: a * curve.start.x + b * curve.control.x + c * curve.corner.x,
      y: a * curve.start.y + b * curve.control.y + c * curve.corner.y + impact * 32,
      scale: mix(1, 0.52, flight),
      rotation: flight * 1080,
    },
    focus: mix(490, 1120, ease(segment(progress, settings.cameraStart, settings.cameraEnd))),
    reveal: ease(segment(progress, settings.revealStart, 1)),
    impactFlash: Math.max(0, 1 - Math.abs(progress - settings.contact) / 0.025) * 0.12,
    grass: Math.max(0, 1 - Math.abs(progress - (settings.contact + 0.025)) / 0.045),
  };
}
