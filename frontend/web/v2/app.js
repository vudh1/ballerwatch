/**
 * V2 experience controls around the unchanged V1 card feed/controller.
 * Baseline: v8.14.0. No API client, runtime store or polling scheduler.
 */
const timeline = import("./timeline.js");
void timeline.catch(() => {
  document.documentElement.classList.remove("v2-cinematic", "v2-launching");
  document.documentElement.classList.add("v2-app-ready");
  document.querySelector("#matchday-app").inert = false;
});

document.querySelector("#clear-v2-caches").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const keys = await caches.keys();
    const beta = /^\/ballerwatch\/beta(?:\/|$)/.test(window.location.pathname);
    await Promise.all(keys.filter((key) => beta
      ? key.startsWith("ballerwatch-beta-") && key.endsWith("-shell")
      : !key.startsWith("ballerwatch-v2-") && /^ballerwatch-v\d.*-shell$/.test(key))
      .map((key) => caches.delete(key)));
    document.querySelector("#v2-cache-status").textContent = "App frontend cache cleared. Reconnect before opening offline.";
  } catch {
    document.querySelector("#v2-cache-status").textContent = "Cache controls are unavailable in this browser.";
  } finally { button.disabled = false; }
});
