/**
 * Original V2 soccer choreography; pure reversible poses from normalized scroll.
 * Baseline: v8.10.0. No network, storage, physics engine or production data.
 * Coordinates refer to the 1440 × 900 scene; edit these controls to retime play.
 */
export const SCENE = Object.freeze({
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
