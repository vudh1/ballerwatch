/**
 * Shared V1/V2 offline and push lifecycle. Baseline: v8.10.0.
 * Each registration owns only its route-specific shell/device caches. Never
 * intercept remote APIs or persist authenticated responses in frontend caches.
 */
const IS_V2 = /\/v2\/sw\.js$/.test(self.location.pathname);
const IS_BETA = /\/beta\/sw\.js$/.test(self.location.pathname);
const CACHE = IS_BETA ? "ballerwatch-beta-__BETA_BUILD_ID__-shell"
  : IS_V2 ? "ballerwatch-v2-v9-1-2-shell" : "ballerwatch-v11-2-0-shell";
const ROOT_SHELL = [
  "./",
  "./index.html",
  "./v2/prepaint.js?v=11.2.0",
  "./styles.css?v=11.2.0",
  "./v2/styles.css?v=11.2.0",
  "./app.js?v=11.2.0",
  "./v2/app.js?v=11.2.0",
  "./v2/timeline.js",
  "./v2/scene-config.mjs",
  "./v2/assets/stadium.svg",
  "./manifest.webmanifest?v=11.2.0",
  "./icon.svg?v=11.2.0",
  "./apple-touch-icon.png?v=11.2.0",
  "./icon-192.png",
  "./icon-512.png",
  "./v2/index.html",
  "./v2/redirect.js",
  "./lib/client.js",
  "./lib/experience.js",
  "./lib/app-channel.js",
  "./lib/public-calendar-cache.js",
  "./lib/public-standings-cache.js",
  "./lib/guest-profile.js",
  "./lib/local-match-edits.js",
  "./lib/settings-choice.js",
  "./lib/notification-state.js"
];
const SHELL = IS_V2 ? ["./", "./index.html", "./redirect.js", "./manifest.webmanifest"] : ROOT_SHELL;
const API = "https://ballerwatch-web.vudhone.workers.dev";
const APP_URL = new URL(IS_V2 ? "../beta/" : "./", self.location.href).href;
const ICON_URL = new URL(IS_V2 ? "../icon.svg" : "./icon.svg", self.location.href).href;
const DEVICE_STATE_CACHE = IS_BETA ? "ballerwatch-beta-device-state-v1"
  : IS_V2 ? "ballerwatch-v2-device-state-v2" : "ballerwatch-device-state-v2";
const DEVICE_LEASE_MS=24*60*60*1000;
const BADGE_STATE_URL = new URL("./.badge-state", self.location.href).href;
const NOTIFICATION_PREFS_URL = new URL("./.notification-prefs", self.location.href).href;
const RSVP_STATE_URL = new URL("./.rsvp-state", self.location.href).href;

function normalizedBadgeCount(value) {
  return Math.min(999, Math.max(0, Math.floor(Number(value) || 0)));
}

async function cachedDeviceValue(key, { persistent = false } = {}) {
  try {
    const cache=await caches.open(DEVICE_STATE_CACHE);
    const response=await cache.match(key);
    if (!response) return null;
    const stored=await response.json();
    if (!persistent && (!Number.isSafeInteger(stored?.expiresAt) ||
        stored.expiresAt <= Date.now() ||
        stored.expiresAt > Date.now()+DEVICE_LEASE_MS)) {
      await cache.delete(key);
      return null;
    }
    return stored.value;
  } catch { return null; }
}
async function storeDeviceValue(key,value,{persistent=false}={}) {
  try {
    const cache=await caches.open(DEVICE_STATE_CACHE);
    await cache.put(key,new Response(JSON.stringify(persistent
      ? {value,persistent:true}
      : {expiresAt:Date.now()+DEVICE_LEASE_MS,value}),
      {headers:{"content-type":"application/json"}}));
  } catch {}
}
async function readBadgeCount() {
  return normalizedBadgeCount((await cachedDeviceValue(BADGE_STATE_URL))?.count);
}
async function writeBadgeCount(count) {
  const normalized=normalizedBadgeCount(count);
  await storeDeviceValue(BADGE_STATE_URL,{count:normalized});
  return normalized;
}

async function applyAppBadge(count) {
  const normalized = normalizedBadgeCount(count);
  try {
    if (normalized > 0 && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(normalized);
    } else if ("clearAppBadge" in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch {}
  return normalized;
}

async function syncBadgeCount(count) {
  const normalized = await writeBadgeCount(count);
  await applyAppBadge(normalized);
  return normalized;
}

async function incrementAppBadge() {
  const current = await readBadgeCount();
  return syncBadgeCount(current + 1);
}

function normalizedChannels(value) {
  return {
    pickup: value?.pickup !== false,
    league: value?.league !== false,
    version: value?.version !== false,
  };
}

function teamKey(name) {
  return String(name||"").trim().replace(/\s+/g," ").toLocaleLowerCase("en");
}
function alertMatchesDeviceTeams(entry, teams = []) {
  if (entry?.channel !== "league" || !teams.length ||
      !Array.isArray(entry?.teams) || !entry.teams.length) return true;
  const chosen = new Set(teams.map(teamKey));
  return entry.teams.some(name => chosen.has(teamKey(name)));
}
async function readNotificationChannels() {
  const stored=await cachedDeviceValue(NOTIFICATION_PREFS_URL,{persistent:true}) || {};
  return { channels:normalizedChannels(stored.channels),
    teams:Array.isArray(stored.teams) ? stored.teams.slice(0,8) : [] };
}
async function writeNotificationChannels(data) {
  const channels=normalizedChannels(data?.channels || data);
  const teams=[...new Set((Array.isArray(data?.teams) ? data.teams : [])
    .map(name=>String(name||"").trim().slice(0,120)).filter(Boolean))].slice(0,8);
  await storeDeviceValue(NOTIFICATION_PREFS_URL,{channels,teams},{persistent:true});
}

function cleanRsvpDates(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item))))].slice(0, 300);
}

async function writeRsvpState(state) {
  await storeDeviceValue(RSVP_STATE_URL,{
    confirmedDates:cleanRsvpDates(state?.confirmedDates),
    waitlistedDates:cleanRsvpDates(state?.waitlistedDates),
  });
}
async function readRsvpState() {
  return await cachedDeviceValue(RSVP_STATE_URL) || {};
}

function skipBookedRsvpAlert(entry, state) {
  const tag = String(entry?.tag || "");
  const reminder = tag.match(/^pickup-rsvp-reminder-(\d{4}-\d{2}-\d{2})$/);
  const capacity = tag.match(/^pickup-capacity-(\d{4}-\d{2}-\d{2})-\d+$/);
  if (!reminder && !capacity) return false;
  const date = (reminder || capacity)[1];
  return (state?.confirmedDates || []).includes(date) ||
    Boolean(reminder && (state?.waitlistedDates || []).includes(date));
}

function safeAppUrl(value) {
  try {
    const url = new URL(String(value || APP_URL), APP_URL);
    if (url.origin !== new URL(APP_URL).origin) return APP_URL;
    if (!url.pathname.startsWith("/ballerwatch/")) return APP_URL;
    if ((IS_BETA || IS_V2) && !url.pathname.startsWith("/ballerwatch/beta/")) return APP_URL;
    if (/\/v2(?:\/|$)/.test(url.pathname)) {
      url.pathname = new URL(APP_URL).pathname;
    }
    return url.href;
  } catch {
    return APP_URL;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE && key.endsWith("-shell") &&
            (IS_BETA ? key.startsWith("ballerwatch-beta-") :
              IS_V2 ? key.startsWith("ballerwatch-v2-") :
              /^ballerwatch-v\d/.test(key) && !key.startsWith("ballerwatch-v2-")))
          .map((key) => caches.delete(key)),
      caches.keys().then(keys=>Promise.all(keys
        .filter(key => key !== DEVICE_STATE_CACHE &&
          (IS_BETA ? /^ballerwatch-beta-device-state-v\d+$/.test(key) :
            IS_V2 ? /^ballerwatch-v2-device-state-v\d+$/.test(key) :
            /^ballerwatch-device-state-v\d+$/.test(key)))
        .map(key=>caches.delete(key)))),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Retired V2 installs now point to beta; an isolated beta scope never
  // claims or erases the production worker's offline cache.
  if (event.request.mode === "navigate" && /\/v2(?:\/|$)/.test(url.pathname)) {
    const destination = new URL(IS_BETA || IS_V2 ? "./" : "./beta/", APP_URL);
    destination.search = url.search;
    destination.hash = url.hash;
    event.respondWith(Promise.resolve(Response.redirect(destination.href, 302)));
    return;
  }

  const networkRequest = new Request(event.request, { cache: "no-store" });

  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        if (response.ok && response.type !== "opaque") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const fallback = await cache.match(new URL("./index.html", self.location.href).href);
          if (fallback) return fallback;
        }
        return Response.error();
      }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ballerwatch:badge-count") {
    event.waitUntil(syncBadgeCount(event.data?.count));
    return;
  }
  if (event.data?.type === "ballerwatch:notification-preferences") {
    event.waitUntil(writeNotificationChannels({channels:event.data?.channels,teams:event.data?.teams}));
    return;
  }
  if (event.data?.type === "ballerwatch:rsvp-state") {
    event.waitUntil(writeRsvpState(event.data));
    return;
  }
  if (event.data?.type !== "ballerwatch:test-notification") return;
  const requestedDelay = Number(event.data?.delayMs);
  const delayMs = Number.isFinite(requestedDelay)
    ? Math.min(10_000, Math.max(0, requestedDelay))
    : 5_000;

  event.waitUntil(new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await self.registration.showNotification("BallerWatch", {
          body: "Test notification.",
          icon: ICON_URL,
          badge: ICON_URL,
          tag: "ballerwatch-local-test",
          data: { url: APP_URL },
        });
      } finally {
        resolve();
      }
    }, delayMs);
  }));
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let entry = null;
    try {
      const [response, devicePrefs, rsvpState] = await Promise.all([
        fetch(API + "/web/board?limit=30", { cache: "no-store" }),
        readNotificationChannels(),
        readRsvpState(),
      ]);
      const payload = await response.json();
      // A suppressed new alert must not replay an older notification.
      const candidate = Array.isArray(payload?.entries) ? payload.entries[0] : null;
      const channel = String(candidate?.channel || "");
      entry = candidate && (!channel || devicePrefs.channels[channel] !== false) &&
        alertMatchesDeviceTeams(candidate, devicePrefs.teams) &&
        !skipBookedRsvpAlert(candidate, rsvpState) ? candidate : null;
    } catch {}

    if (!entry) return;
    const title = entry.title || "BallerWatch updated";
    const options = {
      body: entry.body || "Open BallerWatch for the latest soccer update.",
      icon: ICON_URL,
      badge: ICON_URL,
      tag: entry.tag || "ballerwatch-update",
      renotify: true,
      data: { url: safeAppUrl(entry.url) },
    };
    await Promise.all([
      incrementAppBadge(),
      self.registration.showNotification(title, options),
    ]);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = safeAppUrl(event.notification.data?.url);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(APP_URL) &&
      (IS_V2 || !/\/v2(?:\/|$)/.test(new URL(client.url).pathname)));
    if (existing) {
      await existing.focus();
      existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
