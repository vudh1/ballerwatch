/**
 * A small, deterministic boundary resistance before rewinding the cinematic hero.
 * Wheel bursts and touch drags count independently. Normal downward scrolling,
 * programmatic scene navigation and reduced-motion paths do not use this gate.
 */
export const REWIND = Object.freeze({
  wheelThreshold: 210,
  touchThreshold: 155,
  wheelIdleMs: 500,
});

export function createRewindGate() {
  const pulls = { wheel: 0, touch: 0 };
  let lastWheelAt = -Infinity;
  function reset(kind) {
    if (kind === "wheel" || kind === "touch") pulls[kind] = 0;
    else {
      pulls.wheel = 0;
      pulls.touch = 0;
    }
    if (!kind || kind === "wheel") lastWheelAt = -Infinity;
  }
  function pull(kind, distance, now = 0) {
    if (kind !== "wheel" && kind !== "touch") return { released: false, overflow: 0 };
    const delta = Number(distance);
    if (!Number.isFinite(delta) || delta <= 0) {
      reset(kind);
      return { released: false, overflow: 0 };
    }
    if (kind === "wheel") {
      if (now - lastWheelAt > REWIND.wheelIdleMs) pulls.wheel = 0;
      lastWheelAt = now;
    }
    pulls[kind] += delta;
    const threshold = kind === "wheel" ? REWIND.wheelThreshold : REWIND.touchThreshold;
    if (pulls[kind] < threshold) return { released: false, overflow: 0 };
    const overflow = pulls[kind] - threshold;
    reset(kind);
    return { released: true, overflow };
  }
  function progress(kind) {
    if (kind !== "wheel" && kind !== "touch") return 0;
    const threshold = kind === "wheel" ? REWIND.wheelThreshold : REWIND.touchThreshold;
    return Math.max(0, Math.min(1, pulls[kind] / threshold));
  }
  return { pull, reset, progress };
}
