/**
 * V2 first paint: a brief brand launch, optional scroll hero, then shared cards.
 * Baseline: v8.13.0. Only V2 session keys are read; API startup stays independent.
 */
(() => {
  const root = document.documentElement;
  let skip = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.toggle("v2-reduced", skip);
  try {
    skip ||= sessionStorage.getItem("ballerwatch:v2:intro-seen") === "1";
    root.classList.toggle("v2-launching", !skip &&
      sessionStorage.getItem("ballerwatch:v2:launch-seen") !== "1");
  } catch {
    root.classList.toggle("v2-launching", !skip);
  }
  root.classList.toggle("v2-cinematic", !skip);
  root.classList.toggle("v2-app-ready", skip);
  // Failed optional scripts must never hide an otherwise working shared app.
  window.setTimeout(() => {
    if (root.dataset.timelineReady === "true") return;
    root.classList.remove("v2-cinematic", "v2-launching");
    root.classList.add("v2-app-ready");
    document.querySelector("#matchday-app")?.removeAttribute("inert");
  }, 2500);
})();
