/**
 * Device-local Watching day-card presentation horizon (v11.9.0).
 * Controls only the rendered match days; stored sports fixtures, ICS,
 * follow-list and backend indexing stay complete and unchanged.
 */
export const WATCH_DAY_WINDOWS = Object.freeze({
  "2w": "2 weeks", "1m": "1 month", "2m": "2 months",
  "3m": "3 months", "6m": "6 months", max: "Maximum available",
});
export const DEFAULT_WATCH_DAY_WINDOW = "2m";
export function validWatchDayWindow(value) {
  return Object.hasOwn(WATCH_DAY_WINDOWS, value) ? value : DEFAULT_WATCH_DAY_WINDOW;
}
export function watchWindowDays(startDate, choice = DEFAULT_WATCH_DAY_WINDOW) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) return 0;
  const [year, month, day] = startDate.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day, 12);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0,10) !== startDate) return 0;
  const chosen = validWatchDayWindow(choice);
  if (chosen === "2w") return 14;
  if (chosen === "max") return 400;
  const months = Number.parseInt(chosen, 10);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0, 12)).getUTCDate();
  const end = Date.UTC(year, month - 1 + months, Math.min(day, lastDay), 12);
  return Math.round((end - start) / 86400000);
}
