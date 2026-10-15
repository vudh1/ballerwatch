/**
 * V2 experience controls around the unchanged V1 card feed/controller.
 * Baseline: v8.13.0. No API client, runtime store or polling scheduler.
 */
const timeline = import("./timeline.js");
void timeline.catch(() => {
  document.documentElement.classList.remove("v2-cinematic", "v2-launching");
  document.documentElement.classList.add("v2-app-ready");
  document.querySelector("#matchday-app").inert = false;
});

document.querySelector("#replay-intro").addEventListener("click", async () => {
  try { (await timeline).replayIntro(); } catch {
    document.querySelector("#motion-note").hidden = false;
    document.querySelector("#motion-note").textContent = "The intro is unavailable. Your matches are ready.";
  }
});
document.querySelector("#clear-v2-caches").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => /^ballerwatch-v2-.*-shell$/.test(key))
      .map((key) => caches.delete(key)));
    document.querySelector("#v2-cache-status").textContent = "V2 frontend cache cleared. Reconnect before opening offline.";
  } catch {
    document.querySelector("#v2-cache-status").textContent = "Cache controls are unavailable in this browser.";
  } finally { button.disabled = false; }
});
