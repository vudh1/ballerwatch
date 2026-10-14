/**
 * Native-scroll, event-driven soccer timeline with reversible SVG layer poses.
 * Baseline: v8.10.0. Owns no data requests or audio; cleans up on page exit.
 */
import { SCENE, scenePose, clamp } from "./scene-config.mjs";

const root = document.documentElement;
const intro = document.querySelector("#soccer-intro");
const app = document.querySelector("#matchday-app");
const stage = document.querySelector("#soccer-stage");
const labels = [
  ["THE BUILD-UP", "Every game starts", "with a moment."],
  ["THE STRIKE", "Find your angle.", "Make it count."],
  ["THE FLIGHT", "Follow", "the beautiful game."],
  ["THE REACH", "A game", "of fine margins."],
  ["THE FINISH", "Nothing beats", "that feeling."],
  ["YOUR MATCHDAY", "Now it’s", "your turn."],
];
let frame = 0;
let active = !root.classList.contains("v2-intro-skipped");
let sceneWidth = 1440;
let scrollDistance = 1;
let introTop = 0;
let lastPhase = -1;
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const elements = Object.fromEntries([
  "world", "ball", "shooting-leg", "player-body", "keeper", "net",
  "grass", "flash", "phase", "headline", "progress", "scene-content",
].map((name) => [name, document.querySelector(`#scene-${name}`)]));

function rememberIntro() {
  try { sessionStorage.setItem("ballerwatch:v2:intro-seen", "1"); } catch {}
}

export function finishIntro({ focus = false } = {}) {
  active = false;
  window.cancelAnimationFrame(frame);
  frame = 0;
  rememberIntro();
  root.classList.add("v2-intro-skipped", "v2-app-ready");
  app.inert = false;
  intro.setAttribute("aria-hidden", "true");
  window.scrollTo({ top: 0, behavior: "instant" });
  if (focus) document.querySelector("#matchday-heading")?.focus({ preventScroll: true });
}

function render() {
  frame = 0;
  if (!active || document.hidden) return;
  try {
    const progress = clamp((window.scrollY - introTop) / scrollDistance);
    const pose = scenePose(progress);
    root.dataset.sceneProgress = progress.toFixed(4);
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
    elements["scene-content"].style.opacity = String(1 - pose.reveal);
    app.style.setProperty("--app-reveal", String(pose.reveal));
    const ready = progress >= 0.999;
    root.classList.toggle("v2-app-ready", ready);
    app.inert = !ready;
    if (ready) rememberIntro();
    if (pose.phase !== lastPhase) {
      elements.phase.textContent = `${String(pose.phase + 1).padStart(2, "0")} / ${labels[pose.phase][0]}`;
      elements.headline.replaceChildren(...labels[pose.phase].slice(1).map((line) => {
        const span = document.createElement("span");
        span.textContent = line;
        return span;
      }));
      lastPhase = pose.phase;
    }
  } catch {
    finishIntro();
  }
}

function requestRender() {
  if (root.classList.contains("v2-app-ready") && window.scrollY >= introTop + scrollDistance) return;
  if (active && !frame && !document.hidden) frame = window.requestAnimationFrame(render);
}

function measure() {
  if (!active) return;
  // Stable small-viewport height prevents Safari toolbar changes from retiming play.
  const height = stage.clientHeight || window.innerHeight;
  sceneWidth = Math.max(360, 900 * stage.clientWidth / height);
  document.querySelector("#soccer-scene").setAttribute("viewBox", `0 0 ${sceneWidth} 900`);
  introTop = intro.getBoundingClientRect().top + window.scrollY;
  scrollDistance = intro.offsetHeight - height;
  requestRender();
}

function visibilityChanged() {
  if (document.hidden) {
    window.cancelAnimationFrame(frame);
    frame = 0;
  } else requestRender();
}

export function replayIntro() {
  if (motion.matches) {
    document.querySelector("#motion-note").hidden = false;
    return;
  }
  active = true;
  root.classList.remove("v2-intro-skipped", "v2-app-ready");
  intro.removeAttribute("aria-hidden");
  app.inert = true;
  attachListeners();
  window.scrollTo({ top: 0, behavior: "instant" });
  measure();
  document.querySelector("#skip-intro").focus({ preventScroll: true });
}

function attachListeners() {
  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  document.addEventListener("visibilitychange", visibilityChanged);
}

try {
  if (!Object.values(elements).every(Boolean)) throw new Error("Incomplete scene");
  intro.style.setProperty("--scroll-screens", SCENE.scrollScreens);
  const asset = new Image();
  asset.onerror = () => finishIntro();
  asset.src = SCENE.stadiumAsset;
  document.querySelector("#skip-intro").addEventListener("click", () => finishIntro({ focus: true }));
  attachListeners();
  motion.addEventListener("change", () => { if (motion.matches) finishIntro(); });
  window.addEventListener("pagehide", () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("scroll", requestRender);
    window.removeEventListener("resize", measure);
    document.removeEventListener("visibilitychange", visibilityChanged);
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) finishIntro(); });
  root.dataset.timelineReady = "true";
  if (active) {
    app.inert = true;
    measure();
  } else {
    root.classList.add("v2-app-ready");
    app.inert = false;
  }
} catch {
  finishIntro();
}
