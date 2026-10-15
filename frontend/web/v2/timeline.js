/**
 * V2 branded entry and reversible native-scroll soccer hero, before V1 cards.
 * Baseline: v8.13.0. Transforms/opacity only; no API work or data polling.
 */
import { SCENE, scenePose, clamp } from "./scene-config.mjs";

const root = document.documentElement;
const intro = document.querySelector("#soccer-intro");
const app = document.querySelector("#matchday-app");
const stage = document.querySelector("#soccer-stage");
const launch = document.querySelector("#v2-launch");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const labels = [
  ["THE BUILD-UP", "Before the match.", "One moment."],
  ["THE STRIKE", "Find your angle.", "Make it count."],
  ["THE FLIGHT", "Follow", "the beautiful game."],
  ["THE REACH", "A game", "of fine margins."],
  ["THE FINISH", "Nothing beats", "that feeling."],
  ["YOUR MATCHDAY", "The moment is yours.", "Let’s play."],
];
const elements = Object.fromEntries([
  "world", "ball", "shooting-leg", "player-body", "keeper", "net",
  "grass", "flash", "phase", "headline", "progress", "scene-content",
].map((name) => [name, document.querySelector(`#scene-${name}`)]));
let frame = 0;
let launchTimer = 0;
let sceneWidth = 1440;
let distance = 1;
let lastPhase = -1;
let lastProgress = -1;
let active = root.classList.contains("v2-cinematic");
let listening = false;

function remember(name) {
  try { sessionStorage.setItem(`ballerwatch:v2:${name}`, "1"); } catch { /* Session storage is optional. */ }
}
function dismissLaunch() {
  clearTimeout(launchTimer);
  root.classList.remove("v2-launching");
  launch.hidden = true;
  remember("launch-seen");
}
function revealApp(ready) {
  root.classList.toggle("v2-app-ready", ready);
  app.inert = !ready;
  intro.setAttribute("aria-hidden", String(ready));
}
export function finishIntro({ focus = false } = {}) {
  active = false;
  cancelAnimationFrame(frame);
  frame = 0;
  dismissLaunch();
  root.classList.remove("v2-cinematic");
  root.style.setProperty("--app-reveal", "1");
  revealApp(true);
  remember("intro-seen");
  window.scrollTo({ top: 0, behavior: "instant" });
  if (focus) document.querySelector("#matchday-heading")?.focus({ preventScroll: true });
}
function render() {
  frame = 0;
  if (!active || document.hidden) return;
  try {
    const progress = clamp(Math.max(0, window.scrollY) / distance);
    if (progress === lastProgress) return;
    lastProgress = progress;
    const pose = scenePose(progress);
    root.dataset.sceneProgress = progress.toFixed(4);
    root.style.setProperty("--app-reveal", String(pose.reveal));
    revealApp(pose.reveal >= 0.999);
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
    document.querySelector(".intro-topline").style.opacity = String(1 - pose.reveal);
    if (progress === 1) remember("intro-seen");
    if (pose.phase !== lastPhase) {
      elements.phase.textContent = labels[pose.phase][0];
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
  distance = Math.max(1, intro.offsetHeight - height);
  lastProgress = -1;
  requestRender();
}
function visibilityChanged() {
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
  else {
    if (performance.now() >= SCENE.launchMs) dismissLaunch();
    requestRender();
  }
}
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  document.addEventListener("visibilitychange", visibilityChanged);
}
export function replayIntro() {
  if (motion.matches) {
    document.querySelector("#motion-note").hidden = false;
    return;
  }
  dismissLaunch();
  active = true;
  root.classList.add("v2-cinematic");
  root.style.setProperty("--app-reveal", "0");
  revealApp(false);
  listen();
  window.scrollTo({ top: 0, behavior: "instant" });
  measure();
  document.querySelector("#skip-intro").focus({ preventScroll: true });
}
try {
  if (!Object.values(elements).every(Boolean)) throw new Error("Incomplete scene");
  root.style.setProperty("--scroll-screens", SCENE.scrollScreens);
  root.style.setProperty("--launch-ms", `${SCENE.launchMs}ms`);
  document.querySelector("#skip-intro").addEventListener("click", () => finishIntro({ focus: true }));
  document.querySelector("#skip-launch").addEventListener("click", () => finishIntro({ focus: true }));
  document.querySelector(".v2-skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    finishIntro({ focus: true });
  });
  listen();
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frame);
    clearTimeout(launchTimer);
    frame = 0;
    listening = false;
    window.removeEventListener("scroll", requestRender);
    window.removeEventListener("resize", measure);
    document.removeEventListener("visibilitychange", visibilityChanged);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) { dismissLaunch(); listen(); measure(); }
  });
  motion.addEventListener("change", () => {
    root.classList.toggle("v2-reduced", motion.matches);
    document.querySelector(".v2-static-welcome").hidden = !motion.matches;
    if (motion.matches) finishIntro();
    else replayIntro();
  });
  // Optional local artwork can fail independently of the shared app/data path.
  const stadium = new Image();
  stadium.onerror = () => finishIntro();
  stadium.src = new URL(SCENE.stadiumAsset, import.meta.url).href;
  document.querySelector(".v2-static-welcome").hidden = !motion.matches;
  root.dataset.timelineReady = "true";
  if (active) {
    revealApp(false);
    measure();
    if (root.classList.contains("v2-launching")) {
      launchTimer = setTimeout(dismissLaunch, Math.max(0, SCENE.launchMs - performance.now()));
    } else dismissLaunch();
  } else {
    dismissLaunch();
    revealApp(true);
  }
} catch { finishIntro(); }
