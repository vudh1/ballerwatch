/**
 * V2 first paint: a brief brand launch, optional scroll hero, then shared cards.
 * Baseline: v8.14.0. Only V2 session keys are read; API startup stays independent.
 */
(() => {
  const root = document.documentElement;
  let skip = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.toggle("v2-reduced", skip);
  document.addEventListener("animationstart", (event) => {
    if (event.animationName === "v2-launch-out") root.dataset.launchStarted = String(performance.now());
  });
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "auto";
    if (sessionStorage.getItem("ballerwatch:v2:entry-revision") !== root.dataset.entryRevision) {
      sessionStorage.removeItem("ballerwatch:v2:launch-seen");
      sessionStorage.removeItem("ballerwatch:v2:intro-seen");
      sessionStorage.setItem("ballerwatch:v2:entry-revision", root.dataset.entryRevision);
    }
    skip ||= sessionStorage.getItem("ballerwatch:v2:intro-seen") === "1";
    const resume = sessionStorage.getItem("ballerwatch:v2:main-scroll");
    sessionStorage.removeItem("ballerwatch:v2:main-scroll");
    if (skip && resume !== null && Number.isFinite(Number(resume))) {
      root.dataset.mainScroll = String(Math.max(0, Math.min(500000, Number(resume))));
      // The retired intro height must not become a dashboard scroll offset.
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    }
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
