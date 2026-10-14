/**
 * V2 background soccer choreography, driven by native document scroll.
 * v8.11.0: the shared app is interactive immediately; the scene is decorative.
 * No network, new app controller, timers, user data, or per-card calculation.
 */
import { SCENE, scenePose, clamp } from "./scene-config.mjs";

const root = document.documentElement;
const intro = document.querySelector("#soccer-intro");
const app = document.querySelector("#matchday-app");
const stage = document.querySelector("#soccer-stage");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const labels = [
  ["THE BUILD-UP", "Every game starts", "with a moment."],
  ["THE STRIKE", "Find your angle.", "Make it count."],
  ["THE FLIGHT", "Follow", "the beautiful game."],
  ["THE REACH", "A game", "of fine margins."],
  ["THE FINISH", "Nothing beats", "that feeling."],
  ["YOUR MATCHDAY", "Now it’s", "your turn."],
];
const elements = Object.fromEntries([
  "world", "ball", "shooting-leg", "player-body", "keeper", "net",
  "grass", "flash", "phase", "headline", "progress", "scene-content",
].map((name) => [name, document.querySelector(`#scene-${name}`)]));
let frame = 0;
let sceneWidth = 1440;
let distance = 1;
let lastPhase = -1;
let active = !motion.matches;

function setCardsVisibility(value) {
  root.style.setProperty("--v2-cards-visible", String(value));
}
export function finishIntro({ focus = false } = {}) {
  active = false;
  window.cancelAnimationFrame(frame);
  frame = 0;
  root.classList.add("v2-intro-skipped", "v2-app-ready");
  app.inert = false;
  intro.setAttribute("aria-hidden", "true");
  setCardsVisibility(1);
  if (focus) document.querySelector("#matchday-heading")?.focus({ preventScroll: true });
}
function render() {
  frame = 0;
  if (!active || document.hidden) return;
  try {
    const position = Math.max(0, window.scrollY);
    const progress = clamp(position / distance);
    const reveal = clamp((position - 25) / Math.min(220, window.innerHeight * 0.3));
    const pose = scenePose(progress);
    root.dataset.sceneProgress = progress.toFixed(4);
    setCardsVisibility(reveal);
    const set = (name, value) => elements[name].setAttribute("transform", value);
    set("world", `translate(${sceneWidth / 2 - pose.focus} 0)`);
    set("ball", `translate(${pose.ball.x} ${pose.ball.y}) scale(${pose.ball.scale}) rotate(${pose.ball.rotation})`);
    set("shooting-leg", `rotate(${pose.kick} 13 18)`);
    set("player-body", `translate(${-pose.kick * 0.12} 0) rotate(${-pose.kick * 0.05})`);
    set("keeper", `translate(${pose.keeper.x} ${pose.keeper.y}) rotate(${pose.keeper.rotation})`);
    set("net", `translate(${pose.netPulse * 9} ${pose.netPulse * 3}) scale(${1 + pose.netPulse * 0.025} 1)`);
    elements.grass.style.opacity = String(pose.grass);
    elements.flash.style.opacity = String(pose.impactFlash);
    elements.progress.style.transform = `scaleX(${progress})`;
    elements["scene-content"].style.opacity = String(0.68 * (1 - pose.reveal));
    if (pose.phase !== lastPhase) {
      elements.phase.textContent = `${String(pose.phase + 1).padStart(2, "0")} / ${labels[pose.phase][0]}`;
      elements.headline.replaceChildren(...labels[pose.phase].slice(1).map((line) => {
        const span = document.createElement("span");
        span.textContent = line;
        return span;
      }));
      lastPhase = pose.phase;
    }
  } catch { finishIntro(); }
}
function requestRender() {
  if (active && !frame && !document.hidden) frame = requestAnimationFrame(render);
}
function measure() {
  if (!active) return;
  const height = stage.clientHeight || window.innerHeight;
  sceneWidth = Math.max(360, 900 * stage.clientWidth / height);
  document.querySelector("#soccer-scene").setAttribute("viewBox", `0 0 ${sceneWidth} 900`);
  // Base the timeline on actual document travel; no multi-screen intro gate.
  distance = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  requestRender();
}
function visibilityChanged() {
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
  else requestRender();
}
export function replayIntro() {
  if (motion.matches) {
    document.querySelector("#motion-note").hidden = false;
    return;
  }
  active = true;
  root.classList.remove("v2-intro-skipped");
  intro.removeAttribute("aria-hidden");
  window.scrollTo({ top: 0, behavior: "instant" });
  measure();
}
try {
  if (!Object.values(elements).every(Boolean)) throw new Error("Incomplete scene");
  // Move the optional cinematic control into the foreground header.
  const hideScene = document.querySelector("#skip-intro");
  document.querySelector(".v2-header")?.append(hideScene);
  hideScene.textContent = "Hide animation";
  hideScene.addEventListener("click", () => finishIntro({ focus: true }));
  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", requestRender);
    window.removeEventListener("resize", measure);
    document.removeEventListener("visibilitychange", visibilityChanged);
  });
  motion.addEventListener("change", () => {
    if (motion.matches) finishIntro();
    else replayIntro();
  });
  root.dataset.timelineReady = "true";
  root.classList.add("v2-app-ready");
  app.inert = false;
  if (active) measure();
  else finishIntro();
} catch { finishIntro(); }
