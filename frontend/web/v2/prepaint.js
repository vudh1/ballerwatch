/**
 * V2 first-paint and fail-open gate. Baseline: v8.10.0.
 * Reads V2-only experience state; never delays shared API/session startup.
 */
(() => {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false;
  try { seen = sessionStorage.getItem("ballerwatch:v2:intro-seen") === "1"; } catch {}
  root.classList.toggle("v2-intro-skipped", seen || reduced);
  root.classList.toggle("v2-reduced", reduced);
  window.setTimeout(() => {
    if (root.dataset.timelineReady === "true") return;
    root.classList.add("v2-intro-skipped");
    document.querySelector("#matchday-app")?.removeAttribute("inert");
    if (root.dataset.navigationReady !== "true") {
      document.querySelectorAll("[data-v2-panel]").forEach((panel) => { panel.hidden = false; });
    }
  }, 2500);
})();
