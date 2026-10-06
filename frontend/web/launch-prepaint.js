/**
 * Decides whether the cinematic launch overlay should own the first browser paint.
 * Reads only session-local intro state and the reduced-motion preference; it writes no user data.
 */
(() => {
  const root = document.documentElement;
  const introSessionKey = "ballerwatch-intro-seen-v1";

  try {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seenThisSession = sessionStorage.getItem(introSessionKey) === "1";
    if (reducedMotion || seenThisSession) {
      root.classList.remove("launch-intro-pending");
    }
  } catch {
    // Keep the launch gate active when session storage is unavailable.
  }
})();
