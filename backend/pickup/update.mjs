/**
 * Fetches and normalizes pickup source data into the temporary runtime representation.
 *
 * Documentation baseline: v2.5.6. A stale public endpoint may be rediscovered from the public RSVP frontend; discovered URLs are never persisted or logged. Runtime/private data must never be committed to Git.
 */
import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { loadUserSettings } from "../shared/user-state.mjs";
import { discoverPublicRsvpEndpoint, shouldRediscoverEndpoint } from "./upstream-endpoint.mjs";
import { pickupWeatherChanged } from "../weather/relevance.mjs";

const TIME_ZONE = "America/Los_Angeles";
const DATES_DIR = ".runtime/pickup/data/dates";
const RUNTIME_DIR = ".runtime/pickup";
const INDEX_PATH = ".runtime/pickup/data/index.json";
const STATUS_PATH = ".runtime/pickup/data/status.json";
const PRIVATE_RUNTIME_PATH = path.join(RUNTIME_DIR, "events.json");
const PRIVATE_STATE_PATH = "pickup/state/events.json";
const FEED_STATE_PATH = "pickup/state/feed.json";
const SOURCE_HEALTH_STATE_PATH = "pickup/state/source-health.json";
const WEATHER_REFRESH_MARKER = ".runtime/pickup/weather-refresh-needed";
const settings = loadUserSettings();
const endpointOverride = String(settings?.pickupEndpointOverride || "").trim();
const defaultEndpoint = String(process.env.UPSTREAM_ENDPOINT || "").trim();
let activeEndpoint = endpointOverride || defaultEndpoint;
let endpointSource = endpointOverride
  ? "encrypted-override"
  : defaultEndpoint
    ? "secret-default"
    : "auto-discovered";

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "ttf-watcher/1.0",
      "cache-control": "no-cache",
    },
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.text();
}

function parseJsonp(text, callbackName) {
  const trimmed = text.trim();
  const prefix = `${callbackName}(`;
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(");")) {
    throw new Error("Unexpected upstream response");
  }
  return JSON.parse(trimmed.slice(prefix.length, -2));
}

async function ensureEndpoint() {
  if (activeEndpoint) return activeEndpoint;
  activeEndpoint = await discoverPublicRsvpEndpoint();
  endpointSource = "auto-discovered";
  return activeEndpoint;
}

async function callEndpointAt(endpoint, params) {
  const callbackName = "ttfWatcher";
  const url = new URL(endpoint);
  url.searchParams.set("callback", callbackName);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const payload = parseJsonp(await fetchText(url.toString()), callbackName);
  if (!payload?.ok) {
    throw new Error(payload?.error || "Upstream request failed");
  }
  return payload;
}

async function callEndpoint(params) {
  const endpoint = await ensureEndpoint();
  try {
    return await callEndpointAt(endpoint, params);
  } catch (error) {
    if (!shouldRediscoverEndpoint(error) || endpointSource === "auto-discovered") {
      throw error;
    }

    const discovered = await discoverPublicRsvpEndpoint();
    if (discovered === endpoint) throw error;
    activeEndpoint = discovered;
    endpointSource = "auto-discovered";
    console.warn("Configured RSVP endpoint is retired; using the current public frontend endpoint for this run.");
    return callEndpointAt(activeEndpoint, params);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readEncryptedState(filePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return decryptState(payload) || {};
  } catch {
    return {};
  }
}

function writeIfChanged(filePath, next, stamp = false) {
  const previous = readJson(filePath);

  const stripStamp = (value) => {
    if (!value) return null;
    const clone = structuredClone(value);
    delete clone.updatedAt;
    return clone;
  };

  const prevComparable = stamp ? stripStamp(previous) : previous;
  const nextComparable = stamp ? stripStamp(next) : next;

  if (JSON.stringify(prevComparable) === JSON.stringify(nextComparable)) {
    return false;
  }

  if (stamp) {
    next.updatedAt = new Date().toISOString();
  }

  const dir = path.dirname(filePath);
  if (dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n");
  return true;
}

function writeEncryptedIfChanged(filePath, next) {
  let previous = null;
  try {
    previous = decryptState(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {}
  if (JSON.stringify(previous) === JSON.stringify(next)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(encryptState(next), null, 2) + "\n");
  return true;
}


function removeStaleDateFiles(validDates) {
  if (!fs.existsSync(DATES_DIR)) return;

  const keep = new Set(validDates.map((date) => `${date}.json`));

  for (const name of fs.readdirSync(DATES_DIR)) {
    if (name.endsWith(".json") && !keep.has(name)) {
      fs.unlinkSync(path.join(DATES_DIR, name));
    }
  }
}

function safePlayer(player) {
  return {
    name: String(player?.name || "").trim(),
    participantCount: Math.max(1, Number(player?.participantCount || 1)),
    withdrawRequested: Boolean(player?.withdrawRequested),
  };
}

function normalizePlayerName(value) {
  return String(value || "").trim().toLowerCase();
}

function orderedPrivateRsvpLists(tally, previousEvent = {}, observedAt = new Date().toISOString()) {
  const previousEntries = [
    ...(Array.isArray(previousEvent?.players) ? previousEvent.players : []),
    ...(Array.isArray(previousEvent?.waitlist) ? previousEvent.waitlist : []),
  ];

  const previousByName = new Map();
  let maxOrder = 0;
  previousEntries.forEach((entry, index) => {
    const name = normalizePlayerName(entry?.name);
    if (!name || previousByName.has(name)) return;
    const storedOrder = Number(entry?.voteOrder);
    const voteOrder = Number.isFinite(storedOrder) && storedOrder > 0
      ? storedOrder
      : index + 1;
    maxOrder = Math.max(maxOrder, voteOrder);
    previousByName.set(name, {
      firstSeenAt: String(entry?.firstSeenAt || "").trim(),
      voteOrder,
    });
  });

  const decorate = (items) => (Array.isArray(items) ? items : [])
    .map(safePlayer)
    .filter((player) => player.name)
    .map((player) => {
      const key = normalizePlayerName(player.name);
      const previous = previousByName.get(key);
      const sourceTime = [
        player?.submittedAt,
        player?.createdAt,
        player?.votedAt,
      ].map((value) => String(value || "").trim()).find(Boolean);
      if (previous) {
        return {
          ...player,
          firstSeenAt: sourceTime || previous.firstSeenAt || observedAt,
          voteOrder: previous.voteOrder,
        };
      }
      maxOrder += 1;
      const value = {
        ...player,
        firstSeenAt: sourceTime || observedAt,
        voteOrder: maxOrder,
      };
      previousByName.set(key, {
        firstSeenAt: value.firstSeenAt,
        voteOrder: value.voteOrder,
      });
      return value;
    });

  return {
    players: decorate(tally?.players),
    waitlist: decorate(tally?.waitlist),
  };
}

async function main() {
  const previousFeedState = readEncryptedState(FEED_STATE_PATH);
  const previousPrivateState = readEncryptedState(PRIVATE_STATE_PATH);
  const datesResult = await callEndpoint({ action: "listPlayDates" });

  const dates = [...new Set(
    (Array.isArray(datesResult.dates) ? datesResult.dates : [])
      .map(String)
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
  )].sort();

  const detailByDate = new Map(
    (Array.isArray(datesResult.dateDetails) ? datesResult.dateDetails : [])
      .map((detail) => [String(detail?.date || ""), detail || {}]),
  );

  fs.mkdirSync(DATES_DIR, { recursive: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });

  const privateEvents = {};
  const publicEvents = {};

  for (const date of dates) {
    const tallyResult = await callEndpoint({
      action: "list",
      playDate: date,
    });

    const tally = tallyResult.tally || {};
    const detail = detailByDate.get(date) || {};
    const previousEvent = previousPrivateState?.events?.[date] || {};
    const observedAt = new Date().toISOString();
    const {
      players,
      waitlist,
    } = orderedPrivateRsvpLists(tally, previousEvent, observedAt);

    const publicEvent = {
      ok: true,
      timezone: TIME_ZONE,
      date,
      reserved: Number(tally.totalCount || 0),
      capacity:
        detail.capacity == null || detail.capacity === ""
          ? null
          : Number(detail.capacity),
      startTime: String(detail.startTime || ""),
      endTime: String(detail.endTime || ""),
    };
    publicEvents[date] = publicEvent;
    writeIfChanged(
      path.join(DATES_DIR, `${date}.json`),
      publicEvent,
      true,
    );

    // Private/transient details are used only during this Actions run.
    // .runtime is gitignored and never committed.
    privateEvents[date] = {
      date,
      fieldName: String(detail.fieldName || "").trim(),
      address: String(detail.address || "").trim(),
      locked: Boolean(tally.locked),
      waitlistCount: Number(tally.waitlistCount || 0),
      players,
      waitlist,
    };
  }

  const privatePayload = { events: privateEvents };
  fs.writeFileSync(
    PRIVATE_RUNTIME_PATH,
    JSON.stringify(privatePayload, null, 2) + "\n",
  );
  writeEncryptedIfChanged(PRIVATE_STATE_PATH, privatePayload);

  removeStaleDateFiles(dates);

  const index = {
    ok: true,
    timezone: TIME_ZONE,
    dates: dates.map((date) => ({
      date,
      path: `dates/${date}.json`,
    })),
  };

  writeIfChanged(INDEX_PATH, index);
  writeIfChanged(STATUS_PATH, {
    ok: true,
    timezone: TIME_ZONE,
    lastSuccessfulCheckAt: new Date().toISOString(),
  });
  const nextFeedState = {
    ok: true,
    timezone: TIME_ZONE,
    dates: index.dates,
    events: publicEvents,
  };
  writeEncryptedIfChanged(FEED_STATE_PATH, nextFeedState);

  if (
    pickupWeatherChanged(
      previousFeedState,
      previousPrivateState,
      nextFeedState,
      privatePayload,
    )
  ) {
    fs.mkdirSync(path.dirname(WEATHER_REFRESH_MARKER), { recursive: true });
    fs.writeFileSync(WEATHER_REFRESH_MARKER, "1\n");
    console.log("Weather-relevant pickup schedule changed.");
  }

  writeEncryptedIfChanged(SOURCE_HEALTH_STATE_PATH, {
    ok: true,
    source: endpointSource,
    checkedAt: new Date().toISOString(),
  });

  console.log(`Refreshed ${dates.length} encrypted pickup event(s).`);
}

main().catch((error) => {
  const safeError = String(error?.message || "RSVP source request failed")
    .replace(/https?:\/\/\S+/gi, "<endpoint>")
    .slice(0, 240);
  try {
    writeEncryptedIfChanged(SOURCE_HEALTH_STATE_PATH, {
      ok: false,
      source: endpointSource,
      checkedAt: new Date().toISOString(),
      error: safeError,
    });
  } catch {}
  console.error(safeError);
  process.exit(1);
});
