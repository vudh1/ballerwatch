import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WATCH_DAY_WINDOW, validWatchDayWindow, watchWindowDays }
  from "../../frontend/web/lib/watch-horizon.mjs";
import { nextPublishedPickupDate } from "../../frontend/web/lib/rsvp-choice-source.mjs";
import { watchedDayGroups } from "../../frontend/web/lib/watch-day-groups.mjs";

test("Watching defaults to two calendar months, not 366 rendered days", () => {
  assert.equal(DEFAULT_WATCH_DAY_WINDOW, "2m");
  assert.equal(validWatchDayWindow("unknown"), "2m");
  assert.equal(watchWindowDays("2026-10-25", "2w"), 14);
  assert.equal(watchWindowDays("2026-10-25", "1m"), 31);
  assert.equal(watchWindowDays("2026-10-25", "2m"), 61);
  assert.equal(watchWindowDays("2026-10-25", "3m"), 92);
  assert.equal(watchWindowDays("2026-10-25", "6m"), 182);
  assert.equal(watchWindowDays("2026-10-25", "max"), 400);
  assert.equal(watchWindowDays("invalid", "2m"), 0);
  assert.equal(watchWindowDays("2026-02-31", "2m"), 0);
});

test("Month arithmetic clamps January 31 and handles leap-year boundaries", () => {
  assert.equal(watchWindowDays("2027-01-31", "1m"), 28);
  assert.equal(watchWindowDays("2028-01-31", "1m"), 29);
  assert.equal(watchWindowDays("2027-11-30", "3m"), 91);
});

test("Different day-card choices never mutate the underlying full fixture index", () => {
  const list = [0, 10, 40, 70, 100, 180, 320].map((offset, i) => {
    const d = new Date(Date.UTC(2026, 9, 25 + offset, 12)).toISOString().slice(0, 10);
    return {id:"watch:nba:"+i,kind:"watch",date:d,teams:["NBA · Boston Celtics"]};
  });
  const original = JSON.stringify(list);
  const dates = selection => watchedDayGroups(list, "2026-10-25",
    watchWindowDays("2026-10-25", selection)).map(g => g.date);
  assert.equal(dates("2w").length, 2);
  assert.equal(dates("1m").length, 2);
  assert.equal(dates("2m").length, 3);
  assert.equal(dates("3m").length, 4);
  assert.equal(dates("6m").length, 6);
  assert.equal(dates("max").length, 7);
  assert.equal(JSON.stringify(list), original);
});

test("RSVP dropdown uses next published date, ignoring past and malformed dates", () => {
  const items = [
    {kind:"pickup",date:"2026-10-15",reserved:17},
    {kind:"watch",date:"2026-10-26"},
    {kind:"pickup",date:"2026-11-05",reserved:15},
    {kind:"pickup",sourceDate:"2026-10-29",date:"2026-10-30",reserved:null},
    {kind:"pickup",sourceDate:"invalid",reserved:20},
  ];
  assert.equal(nextPublishedPickupDate(items, "2026-10-25"), "2026-10-29");
  assert.equal(nextPublishedPickupDate(items, "2026-11-06"), "");
  assert.equal(nextPublishedPickupDate(items, "nonsense"), "");
  assert.equal(nextPublishedPickupDate([], "2026-10-25"), "");
});
