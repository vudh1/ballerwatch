/**
 * V2 navigation and experience controls over the shared application controller.
 * Baseline: v8.10.0. No second API client, runtime store, or polling scheduler.
 */
const timeline = import("./timeline.js");
void timeline.catch(() => {
  document.documentElement.classList.add("v2-intro-skipped", "v2-app-ready");
  document.querySelector("#matchday-app").inert = false;
});

const buttons = [...document.querySelectorAll("[data-v2-target]")];
const panels = [...document.querySelectorAll("[data-v2-panel]")];

function showPanel(name, { focus = false } = {}) {
  for (const panel of panels) panel.hidden = panel.dataset.v2Panel !== name;
  for (const button of buttons) {
    button.setAttribute("aria-current", button.dataset.v2Target === name ? "page" : "false");
  }
  if (focus) {
    window.scrollTo({ top: document.querySelector("#matchday-app").offsetTop, behavior: "instant" });
    document.querySelector(`[data-v2-panel="${name}"] h2`)?.focus({ preventScroll: true });
  }
  // Shared standings/card layout measures after a formerly hidden panel appears.
  window.dispatchEvent(new Event("resize"));
}

for (const button of buttons) {
  button.addEventListener("click", () => showPanel(button.dataset.v2Target, { focus: true }));
}
document.querySelector("#v2-ai").addEventListener("click", () => document.querySelector("#chat-launcher").click());
document.querySelector("#v2-inbox").addEventListener("click", () => document.querySelector("#notification-bell").click());
document.querySelector("#replay-intro").addEventListener("click", async () => {
  showPanel("matchday");
  try { (await timeline).replayIntro(); } catch {
    document.querySelector("#motion-note").hidden = false;
    document.querySelector("#motion-note").textContent = "The intro is unavailable. Your matchday is ready.";
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

document.querySelector("#calendar-grid").addEventListener("click", (event) => {
  if (event.target.closest('.calendar-day[aria-disabled="false"]')) showPanel("matchday");
});
document.querySelector("#calendar-game-picker").addEventListener("click", (event) => {
  if (event.target.closest(".calendar-game-choice")) showPanel("matchday");
});
document.documentElement.dataset.navigationReady = "true";
showPanel("matchday");
