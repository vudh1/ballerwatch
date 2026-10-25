/**
 * V2 branded entry and layered native-scroll soccer hero, before V1 cards.
 * Baseline: v11.2.0. Transforms/opacity only; no API work or data polling.
 */
import { SCENE, featureStory, scenePose, cameraFlash, clamp } from "./scene-config.mjs";
import { createRewindGate } from "./rewind-gate.mjs";

const root = document.documentElement;
const intro = document.querySelector("#soccer-intro");
const app = document.querySelector("#matchday-app");
const stage = document.querySelector("#soccer-stage");
const launch = document.querySelector("#v2-launch");
const topLine = document.querySelector(".intro-topline");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const elements = Object.fromEntries([
  "world", "background-world", "ball", "player", "shooting-leg", "shooting-calf", "plant-leg", "player-body", "player-arms", "keeper", "keeper-arms", "keeper-legs", "net",
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
const rewindGate = createRewindGate();
let touchLastY = null;
let touchUnlocked = false;
const cameraFlashes = [...document.querySelectorAll("[data-camera-flash]")];
const launcher = document.querySelector("#chat-launcher");

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
  if (ready) launcher.inert = false;
  intro.setAttribute("aria-hidden", String(ready));
}
export function finishIntro({ focus = false } = {}) {
  active = false;
  rewindGate.reset();
  touchLastY = null;
  touchUnlocked = false;
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
function skipIntro() {
  if (motion.matches || !active) return finishIntro({ focus: true });
  dismissLaunch();
  remember("intro-seen");
  measure();
  window.scrollTo({ top: distance, behavior: "instant" });
  lastProgress = -1;
  render();
  document.querySelector("#matchday-heading")?.focus({ preventScroll: true });
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
    launcher.inert = pose.reveal <= 0;
    const set = (name, value) => elements[name].setAttribute("transform", value);
    const camera = `translate(${sceneWidth / 2 - pose.focus} 0)`;
    set("world", camera);
    set("background-world", camera);
    set("ball", `translate(${pose.ball.x} ${pose.ball.y}) scale(${pose.ball.scale}) rotate(${pose.ball.rotation})`);
    set("player", `translate(${350 + pose.player.shiftX} ${605 + pose.player.bob})`);
    set("shooting-leg", `rotate(${pose.kick} 13 18)`);
    set("shooting-calf", `rotate(${pose.knee} 45 75)`);
    set("plant-leg", `rotate(${pose.player.plant} -5 15)`);
    set("player-body", `rotate(${pose.player.torso} 8 -50)`);
    set("player-arms", `rotate(${pose.player.arms} 0 -85)`);
    set("keeper", `translate(${pose.keeper.x} ${pose.keeper.y}) rotate(${pose.keeper.rotation})`);
    set("keeper-arms", `rotate(${-pose.keeper.reach} 0 -70)`);
    set("keeper-legs", `rotate(${pose.keeper.load - 7 * pose.keeper.landing} 0 -10)`);
    set("net", `translate(${pose.netPulse * 9} ${pose.netPulse * 3}) scale(${1 + pose.netPulse * 0.025} 1)`);
    cameraFlashes.forEach((flash, index) => {
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
// Only block an upward gesture trying to cross the top of the matchday page.
// Internal scrollable lists, regular downward motion, scrolling within the
// stadium, and programmatic scrollTo() stay under native browser control.
function scrollableChildCanMoveUp(target) {
  let node = target?.nodeType === 1 ? target : target?.parentElement;
  while (node && node !== document.documentElement) {
    if (node.scrollHeight > node.clientHeight + 2 && node.scrollTop > 2) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "scroll" || overflow === "auto") return true;
    }
    node = node.parentElement;
  }
  return false;
}
function guardReady(event) {
  return active && !motion.matches && !root.classList.contains("v2-launching") &&
    !document.querySelector("dialog[open]") && !scrollableChildCanMoveUp(event.target);
}
function rewindWheel(event) {
  if (!guardReady(event) || event.ctrlKey) return;
  const unit = event.deltaMode === 1 ? 16 :
    event.deltaMode === 2 ? window.innerHeight : 1;
  const delta = event.deltaY * unit;
  if (delta >= 0) {
    rewindGate.reset("wheel");
    return;
  }
  const position = Math.max(0, window.scrollY);
  if (position < distance - 2) {
    rewindGate.reset("wheel");
    return;
  }
  // Let the user scroll naturally to the top of the main feed first.
  const crossing = position + delta < distance;
  if (!crossing || !event.cancelable) return;
  event.preventDefault();
  window.scrollTo({ top: distance, behavior: "instant" });
  const result = rewindGate.pull("wheel", distance - position - delta, performance.now());
  if (result.released) {
    // A firm continued pull crosses into the reversible cinematic timeline.
    window.scrollTo({ top: Math.max(0, distance - Math.max(4, result.overflow)),
      behavior: "instant" });
  }
}
function rewindTouchStart(event) {
  touchLastY = event.touches.length === 1 ? event.touches[0].clientY : null;
  touchUnlocked = false;
  rewindGate.reset("touch");
}
function rewindTouchMove(event) {
  if (touchLastY === null || event.touches.length !== 1) return;
  const y = event.touches[0].clientY;
  const pull = y - touchLastY;
  touchLastY = y;
  if (touchUnlocked || !guardReady(event)) return;
  if (pull <= 0) {
    rewindGate.reset("touch");
    return;
  }
  const position = Math.max(0, window.scrollY);
  if (position < distance - 2) return; // Already rewinding the stadium.
  if (position > distance + 8 || !event.cancelable) return;
  event.preventDefault();
  window.scrollTo({ top: distance, behavior: "instant" });
  const result = rewindGate.pull("touch", pull);
  if (result.released) {
    touchUnlocked = true;
    window.scrollTo({ top: Math.max(0, distance - Math.max(4, result.overflow)),
      behavior: "instant" });
  }
}
function rewindTouchEnd() {
  touchLastY = null;
  touchUnlocked = false;
  rewindGate.reset("touch");
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
  window.addEventListener("wheel", rewindWheel, { passive: false });
  window.addEventListener("touchstart", rewindTouchStart, { passive: true });
  window.addEventListener("touchmove", rewindTouchMove, { passive: false });
  window.addEventListener("touchend", rewindTouchEnd, { passive: true });
  window.addEventListener("touchcancel", rewindTouchEnd, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  document.addEventListener("visibilitychange", visibilityChanged);
}
function startIntro() {
  if (motion.matches) {
    return;
  }
  dismissLaunch();
  rewindGate.reset();
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
  document.querySelector("#skip-intro").addEventListener("click", skipIntro);
  document.querySelector(".v2-skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    skipIntro();
  });
  listen();
  window.addEventListener("pagehide", () => {
    if (active) {
      try { sessionStorage.setItem("ballerwatch:v2:main-scroll", String(Math.max(0, window.scrollY - distance))); }
      catch { /* Native browser restoration remains available without storage. */ }
    }
    cancelAnimationFrame(frame);
    clearTimeout(launchTimer);
    frame = 0;
    listening = false;
    window.removeEventListener("scroll", requestRender);
    window.removeEventListener("wheel", rewindWheel);
    window.removeEventListener("touchstart", rewindTouchStart);
    window.removeEventListener("touchmove", rewindTouchMove);
    window.removeEventListener("touchend", rewindTouchEnd);
    window.removeEventListener("touchcancel", rewindTouchEnd);
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
    if (root.dataset.mainScroll !== undefined) {
      window.scrollTo({ top: Number(root.dataset.mainScroll), behavior: "instant" });
      delete root.dataset.mainScroll;
    }
  }
} catch { finishIntro(); }
