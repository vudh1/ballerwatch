/**
 * V2 first-paint and fail-open gate. Baseline: v8.10.0.
 * Reads V2-only experience state; never delays shared API/session startup.
 */
(() => {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Background animation replays naturally on scroll; only reduced motion skips it.
  root.classList.toggle("v2-intro-skipped", reduced);
  root.classList.toggle("v2-reduced", reduced);
  root.classList.add("v2-app-ready");
  window.setTimeout(() => {
    if (root.dataset.timelineReady === "true") return;
    root.classList.add("v2-intro-skipped");
    document.querySelector("#matchday-app")?.removeAttribute("inert");
    if (root.dataset.navigationReady !== "true") {
      document.querySelectorAll("[data-v2-panel]").forEach((panel) => { panel.hidden = false; });
    }
  }, 2500);
})();
