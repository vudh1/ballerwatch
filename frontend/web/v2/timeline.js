/**
 * V2 branded entry and layered native-scroll soccer hero, before V1 cards.
 * Baseline: v8.14.0. Transforms/opacity only; no API work or data polling.
 */
import { SCENE, featureStory, scenePose, cameraFlash, clamp } from "./scene-config.mjs";

const root = document.documentElement;
const intro = document.querySelector("#soccer-intro");
const app = document.querySelector("#matchday-app");
const stage = document.querySelector("#soccer-stage");
const launch = document.querySelector("#v2-launch");
const topLine = document.querySelector(".intro-topline");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const elements = Object.fromEntries([
  "world", "background-world", "ball", "shooting-leg", "player-body", "keeper", "net",
  "grass", "flash", "phase", "headline", "description", "progress", "scene-content", "copy",
].map((name) => [name, document.querySelector(`#scene-${name}`)]));
let frame = 0;
let launchTimer = 0;
let launchDeadline = Infinity;
let sceneWidth = 1440;
let distance = 1;
let lastStory = null;
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
  if (ready) document.querySelector(".v2-quick-actions").inert = false;
  intro.setAttribute("aria-hidden", String(ready));
}
export function finishIntro({ focus = false } = {}) {
  active = false;
  cancelAnimationFrame(frame);
  frame = 0;
  dismissLaunch();
  root.classList.remove("v2-cinematic", "v2-revealing");
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
    root.classList.toggle("v2-revealing", progress >= SCENE.revealStart);
    revealApp(pose.reveal >= 0.1);
    document.querySelector(".v2-quick-actions").inert = pose.reveal <= 0;
    const set = (name, value) => elements[name].setAttribute("transform", value);
    const camera = `translate(${sceneWidth / 2 - pose.focus} 0)`;
    set("world", camera);
    set("background-world", camera);
    set("ball", `translate(${pose.ball.x} ${pose.ball.y}) scale(${pose.ball.scale}) rotate(${pose.ball.rotation})`);
    set("shooting-leg", `rotate(${pose.kick} 13 18)`);
    set("player-body", `translate(${-pose.kick * 0.12} 0) rotate(${-pose.kick * 0.05})`);
    set("keeper", `translate(${pose.keeper.x} ${pose.keeper.y}) rotate(${pose.keeper.rotation})`);
    set("net", `translate(${pose.netPulse * 9} ${pose.netPulse * 3}) scale(${1 + pose.netPulse * 0.025} 1)`);
    document.querySelectorAll("[data-camera-flash]").forEach((flash, index) => {
      flash.setAttribute("opacity", String(cameraFlash(progress, index)));
    });
    elements.grass.style.opacity = String(pose.grass);
    elements.flash.style.opacity = String(pose.impactFlash);
    elements.progress.style.transform = `scaleX(${progress})`;
    elements["scene-content"].style.opacity = String(1 - pose.reveal);
    const copyOpacity = 1 - clamp((progress - (SCENE.revealStart - 0.06)) / 0.06);
    elements.copy.style.opacity = String(copyOpacity);
    elements["scene-content"].style.filter = pose.reveal > 0 ? `blur(${pose.reveal * 10}px)` : "none";
    topLine.style.opacity = String(copyOpacity);
    if (progress === 1) remember("intro-seen");
    const story = featureStory(progress);
    if (story !== lastStory) {
      elements.phase.textContent = story.label;
      elements.description.textContent = story.description;
      elements.headline.replaceChildren(...story.title.map((line) => {
        const span = document.createElement("span");
        span.textContent = line;
        return span;
      }));
      lastStory = story;
    }
  } catch { finishIntro(); }
}
function requestRender() {
  if (active && !frame && !document.hidden) frame = requestAnimationFrame(render);
}
function measure() {
  if (!active) return;
  const height = stage.clientHeight || window.innerHeight;
  sceneWidth = Math.max(1, 900 * stage.clientWidth / height);
  document.querySelectorAll(".soccer-scene").forEach((scene) => {
    scene.setAttribute("viewBox", `0 0 ${sceneWidth} 900`);
  });
  distance = Math.max(1, intro.offsetHeight - height);
  lastProgress = -1;
  requestRender();
}
function visibilityChanged() {
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
  else {
    if (performance.now() >= launchDeadline) dismissLaunch();
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
function startIntro() {
  if (motion.matches) {
    return;
  }
  dismissLaunch();
  active = true;
  root.classList.add("v2-cinematic");
  root.classList.remove("v2-revealing");
  root.style.setProperty("--app-reveal", "0");
  revealApp(false);
  listen();
  window.scrollTo({ top: 0, behavior: "instant" });
  measure();
  document.querySelector("#skip-intro").focus({ preventScroll: true });
}
// Retain the old module export for already-open pre-migration documents.
export { startIntro as replayIntro };

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
    else startIntro();
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
      const started = Number(root.dataset.launchStarted);
      launchDeadline = (Number.isFinite(started) ? started : performance.now()) + SCENE.launchMs;
      launchTimer = setTimeout(dismissLaunch, Math.max(0, launchDeadline - performance.now()));
    } else dismissLaunch();
  } else {
    dismissLaunch();
    revealApp(true);
  }
} catch { finishIntro(); }
