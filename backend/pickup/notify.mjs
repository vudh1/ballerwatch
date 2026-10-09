/**
 * Calculates pickup notification transitions while honoring owner, mute, snooze, and waitlist rules.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { loadUserSettings } from "../shared/user-state.mjs";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { appendWebNotification } from "../shared/web-notifications.mjs";
import {
  applyPickupMatchOverride,
  matchHidden,
  pickupOverrideId,
} from "../shared/match-overrides.mjs";
import {
  localMinutesUntilStart,
  matchStartReminderDue,
  rsvpReminderDue,
} from "../shared/match-reminders.mjs";
import { parseTime, selectPrimaryEvent, weekStart } from "./selection.mjs";
import { pickupCapacityAlert } from "./capacity-policy.mjs";

const TIME_ZONE = "America/Los_Angeles";
const STATE_PATH = "pickup/state/notify.json";
const RUNTIME_PATH = ".runtime/pickup/events.json";
const RUNTIME_INDEX_PATH = ".runtime/pickup/data/index.json";
const RUNTIME_DATES_DIR = ".runtime/pickup/data/dates";
const STATE_SECRET = (process.env.TRACKER_STATE_KEY || "").trim();

if (!STATE_SECRET) {
  throw new Error("A private tracker state key is not available.");
}

async function deliverPickupNotification({
  body,
  webText = "",
  title = "Pickup update",
  tag = "ballerwatch-pickup",
}) {
  appendWebNotification("pickup", {
    title,
    body: webText || body,
    tag,
  });
  return true;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readState() {
  const raw = readJson(STATE_PATH);
  if (!raw) return {};
  const decrypted = decryptState(raw);
  return decrypted && typeof decrypted === "object" ? decrypted : raw;
}

function writeState(state) {
  const current = readState();
  if (JSON.stringify(current) === JSON.stringify(state)) return;
  fs.mkdirSync("pickup/state", { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(encryptState(state), null, 2) + "\n");
}

function stateKey() {
  return crypto.createHash("sha256").update(STATE_SECRET).digest();
}

function encryptSnapshot(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", stateKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decryptSnapshot(payload) {
  try {
    if (!payload || payload.v !== 1) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      stateKey(),
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return null;
  }
}

function pacificParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function currentFutureDates(nowDate) {
  const index = readJson(RUNTIME_INDEX_PATH);
  if (!index?.ok || !Array.isArray(index.dates)) return [];
  return index.dates
    .map((item) => String(item?.date || ""))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= nowDate)
    .sort();
}

function eventForDate(sourceDate, settings = {}) {
  if (matchHidden(settings, pickupOverrideId(sourceDate))) return null;
  const event = readJson(`${RUNTIME_DATES_DIR}/${sourceDate}.json`);
  if (!event?.ok) return null;
  const privateEvents = readJson(RUNTIME_PATH)?.events || {};
  const privateEvent = privateEvents[sourceDate] || {
    date: sourceDate,
    fieldName: "",
    address: "",
    locked: false,
    waitlistCount: 0,
    players: [],
    waitlist: [],
  };
  const effective = applyPickupMatchOverride({
    id: pickupOverrideId(sourceDate),
    sourceDate,
    date: sourceDate,
    startTime: event.startTime,
    endTime: event.endTime,
    fieldName: privateEvent.fieldName,
    address: privateEvent.address,
  }, settings);
  return {
    ...event,
    date: effective.date,
    sourceDate,
    startTime: effective.startTime,
    endTime: effective.endTime,
    manualOverride: effective.manualOverride,
    overrideUpdatedAt: effective.overrideUpdatedAt,
    private: {
      ...privateEvent,
      date: effective.date,
      fieldName: effective.fieldName,
      address: effective.address,
    },
  };
}

function activeSnoozeUntil(settings, date) {
  const candidates = [
    settings?.snoozeUntil,
    settings?.snoozedDates?.[date],
  ]
    .map((value) => Date.parse(value || ""))
    .filter((value) => Number.isFinite(value) && value > Date.now());

  return candidates.length ? Math.max(...candidates) : null;
}

function isDateSnoozed(settings, date) {
  return activeSnoozeUntil(settings, date) != null;
}

async function processNewDates(state, now, settings) {
  const currentDates = currentFutureDates(now.date);
  const knownDates = Array.isArray(state.knownDates) ? state.knownDates : null;

  // Seed silently the first time this feature runs so existing dates do not look new.
  if (!knownDates) {
    return { ...state, knownDates: currentDates };
  }

  const newlyAdded = currentDates.filter((date) => !knownDates.includes(date));
  const closestWeek = currentDates.length ? weekStart(currentDates[0]) : "";

  for (const date of newlyAdded) {
    // "Watch only the closest week": still remember later dates, but do not alert
    // on them until their week becomes the closest week.
    if (weekStart(date) !== closestWeek) continue;
    const event = eventForDate(date, settings);
    if (!event) continue;

    if (isDateSnoozed(settings, date)) {
      console.log("New-date alert suppressed by snooze.");
      continue;
    }

    const reserved = countOrNull(event.reserved);
    const capacity = countOrNull(event.capacity);
    const remaining =
      Number.isFinite(reserved) && Number.isFinite(capacity)
        ? capacity - reserved
        : null;

    const lines = [
      "🆕 NEW MATCH DATE ADDED",
      formatDate(date),
    ];

    if (Number.isFinite(reserved) && Number.isFinite(capacity)) {
      lines.push(
        remaining > 0
          ? `${reserved}/${capacity} reserved — ${remaining} ${remaining === 1 ? "spot" : "spots"} left`
          : `${reserved}/${capacity} reserved — full`,
      );
    }

    if (event.private?.fieldName) lines.push(`📍 ${event.private.fieldName}`);
    if (event.private?.address) lines.push(event.private.address);
    const mapUrl = googleMapsUrl(event.private?.fieldName, event.private?.address);
    if (mapUrl) lines.push(`🗺️ ${mapUrl}`);

    const eventTime = timeLine(event);
    if (eventTime) lines.push(eventTime);

    await deliverPickupNotification({
      body: lines.join("\n"),
      title: "New pickup date",
      tag: `pickup-new-${date}`,
    });
  }

  return { ...state, knownDates: currentDates };
}

function selectEvent(now, settings) {
  const index = readJson(RUNTIME_INDEX_PATH);
  if (!index?.ok || !Array.isArray(index.dates)) {
    throw new Error("pickup/data/index.json is unavailable.");
  }

  const sourceDates = index.dates
    .map((item) => String(item?.date || ""))
    .filter(Boolean);
  const effectiveByDate = new Map();
  for (const sourceDate of sourceDates) {
    const event = eventForDate(sourceDate, settings);
    if (event?.date) effectiveByDate.set(event.date, event);
  }
  const dates = [...effectiveByDate.keys()].sort();

  const selected = selectPrimaryEvent({
    dates,
    loadEvent: (date) => effectiveByDate.get(date) || null,
    nowDate: now.date,
    minuteOfDay: now.minuteOfDay,
    settings,
  });

  if (selected.event) {
    console.log(
      `Selected primary event ${selected.event.date} (${selected.reason}).`,
    );
  } else {
    console.log("No eligible event in the closest week.");
  }

  return selected;
}

function isMatchInProgress(event, now) {
  if (!event || event.date !== now.date) return false;

  const start = parseTime(event.startTime);
  const end = parseTime(event.endTime);

  if (start == null || end == null) return false;
  return now.minuteOfDay >= start && now.minuteOfDay < end;
}

function formatDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));

  return `${weekday} ${month}/${day}`;
}

function countOrNull(value) {
  if (value == null || value === "") return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function snapshotFromEvent(event) {
  return {
    date: event.date,
    fieldName: String(event.private.fieldName || ""),
    address: String(event.private.address || ""),
    locked: Boolean(event.private.locked),
    reserved: countOrNull(event.reserved),
    capacity: countOrNull(event.capacity),
    startTime: String(event.startTime || ""),
    endTime: String(event.endTime || ""),
  };
}

function secureFingerprint(event, snapshot) {
  return crypto
    .createHmac("sha256", stateKey())
    .update(JSON.stringify(snapshot))
    .digest("hex");
}

function weatherDetailsChanged(previous, current) {
  if (!previous) return false;
  return (
    previous.date !== current.date ||
    previous.fieldName !== current.fieldName ||
    previous.address !== current.address ||
    previous.startTime !== current.startTime ||
    previous.endTime !== current.endTime
  );
}

function publicDetailsChanged(previous, current) {
  if (!previous) return false;
  return (
    weatherDetailsChanged(previous, current) ||
    previous.locked !== current.locked
  );
}

function googleMapsUrl(fieldName, address) {
  const query = [fieldName, address].filter(Boolean).join(", ").trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

function locationLines(snapshot) {
  const lines = [];
  if (snapshot.fieldName) {
    lines.push(`📍 ${snapshot.fieldName}`);
  }
  if (snapshot.address) {
    lines.push(snapshot.address);
  }
  const mapUrl = googleMapsUrl(snapshot.fieldName, snapshot.address);
  if (mapUrl) {
    lines.push(`🗺️ ${mapUrl}`);
  }
  return lines;
}

function timeLine(event) {
  const start = String(event.startTime || "").trim();
  const end = String(event.endTime || "").trim();
  if (start && end) return `🕒 ${start}–${end}`;
  if (start) return `🕒 ${start}`;
  if (end) return `🕒 Ends ${end}`;
  return "";
}

async function processCapacityAlerts(state, now, settings) {
  // Each source date gets its own encrypted reservation baseline, so the
  // highlighted "primary" match changing never loses another date's alerts.
  const previousByDate = state.capacitySnapshots && typeof state.capacitySnapshots === "object" &&
    !Array.isArray(state.capacitySnapshots) ? state.capacitySnapshots : {};
  const priorPrimary = decryptSnapshot(state.snapshot);
  const nextByDate = {};

  for (const sourceDate of currentFutureDates(now.date)) {
    const event = eventForDate(sourceDate, settings);
    if (!event || event.date < now.date) continue;
    const current = snapshotFromEvent(event);
    const previous = previousByDate[sourceDate] ||
      (state.eventDate === current.date && priorPrimary?.date === current.date
        ? priorPrimary : null);
    nextByDate[sourceDate] = {
      reserved: current.reserved,
      capacity: current.capacity,
    };

    const startsAt = parseTime(event.startTime);
    const started = event.date === now.date &&
      startsAt != null && now.minuteOfDay >= startsAt;
    const suppressed = (Array.isArray(settings.mutedDates) &&
      (settings.mutedDates.includes(sourceDate) || settings.mutedDates.includes(event.date))) ||
      isDateSnoozed(settings, sourceDate) || isDateSnoozed(settings, event.date);
    // Even when suppressed, advance the baseline so alerts aren't replayed
    // after a mute ends or when a match has already begun.
    if (started || suppressed) continue;

    const alert = pickupCapacityAlert(previous, current);
    if (!alert) continue;
    const title = alert.kind === "full" ? "Pickup RSVP full" :
      alert.kind === "spot"
        ? `Pickup: ${alert.remaining} ${alert.remaining === 1 ? "spot" : "spots"} left`
        : `Pickup RSVP ${alert.kind} filled`;
    const headline = alert.kind === "full" ? "⛔ RSVP FULL" :
      alert.kind === "spot"
        ? `🚨 ${alert.remaining} ${alert.remaining === 1 ? "spot" : "spots"} remaining`
        : `📈 RSVP reached ${alert.kind} capacity`;
    const spotsLine = alert.remaining > 0
      ? `${alert.remaining} ${alert.remaining === 1 ? "spot" : "spots"} left`
      : "full";
    await deliverPickupNotification({
      title,
      tag: `pickup-capacity-${sourceDate}-${alert.reserved}`,
      body: [
        headline,
        formatDate(event.date),
        `${alert.reserved}/${alert.capacity} reserved (${alert.occupancyPercent}%) — ${spotsLine}`,
        ...locationLines(current),
        timeLine(event),
      ].filter(Boolean).join("\n"),
    });
  }
  // Expired/cancelled dates are dropped; the next observed count for a new
  // date creates a baseline without a misleading historical milestone.
  return { ...state, capacitySnapshots: nextByDate };
}

async function processScheduledReminders(state, now, settings) {
  const rsvpSent = new Set(
    Array.isArray(state.rsvpReminderDates) ? state.rsvpReminderDates : [],
  );
  const hourSent = new Set(
    Array.isArray(state.matchHourReminderDates) ? state.matchHourReminderDates : [],
  );
  const dates = currentFutureDates(now.date);

  for (const date of dates) {
    if (isDateSnoozed(settings, date)) continue;
    const event = eventForDate(date);
    if (!event) continue;
    const startMinute = parseTime(event.startTime);
    const minutesUntilStart = localMinutesUntilStart({
      matchDate: date,
      startMinute,
      nowDate: now.date,
      nowMinute: now.minuteOfDay,
    });
    if (!Number.isFinite(minutesUntilStart)) continue;

    const reserved = countOrNull(event.reserved);
    const capacity = countOrNull(event.capacity);
    const remaining =
      Number.isFinite(reserved) && Number.isFinite(capacity)
        ? capacity - reserved
        : null;
    const capacityLine = Number.isFinite(reserved) && Number.isFinite(capacity)
      ? (remaining > 0
          ? `${reserved}/${capacity} reserved — ${remaining} ${remaining === 1 ? "spot" : "spots"} left`
          : `${reserved}/${capacity} reserved — full`)
      : "";
    const publicLines = [
      formatDate(date),
      capacityLine,
      ...locationLines(snapshotFromEvent(event)),
      timeLine(event),
    ].filter(Boolean);

    if (
      !rsvpSent.has(date) &&
      !event.private?.locked &&
      (!Number.isFinite(remaining) || remaining > 0) &&
      rsvpReminderDue(minutesUntilStart)
    ) {
      await deliverPickupNotification({
        body: [...publicLines, "RSVP if you plan to play."].join("\n"),
        title: "Pickup RSVP reminder",
        tag: `pickup-rsvp-reminder-${date}`,
      });
      rsvpSent.add(date);
    }

    if (!hourSent.has(date) && matchStartReminderDue(minutesUntilStart)) {
      await deliverPickupNotification({
        body: ["Starts in about 1 hour.", ...publicLines].join("\n"),
        title: "Pickup starts in 1 hour",
        tag: `pickup-start-reminder-${date}`,
      });
      hourSent.add(date);
    }
  }

  return {
    ...state,
    rsvpReminderDates: [...rsvpSent].filter((date) => date >= now.date).sort(),
    matchHourReminderDates: [...hourSent].filter((date) => date >= now.date).sort(),
  };
}

async function main() {
  const now = pacificParts();
  const nowIso = new Date().toISOString();
  let state = readState();
  const settings = loadUserSettings();

  state = await processNewDates(state, now, settings);
  state = await processScheduledReminders(state, now, settings);
  state = await processCapacityAlerts(state, now, settings);
  writeState(state);

  const selected = selectEvent(now, settings);
  const event = selected.event;

  if (!event) {
    console.log("No eligible event.");
    return;
  }

  const snapshot = snapshotFromEvent(event);

  const previousSnapshot = decryptSnapshot(state.snapshot);
  const currentFingerprint = secureFingerprint(event, snapshot);

  if (selected.suppressed || isDateSnoozed(settings, event.date)) {
    writeState({
      ...state,
      eventDate: event.date,
      lastObservedFingerprint: currentFingerprint,
      snapshot: encryptSnapshot(snapshot),
    });
    console.log("Selected closest-week event is muted/snoozed; state recorded without notification.");
    return;
  }
  const changed = state.lastObservedFingerprint !== currentFingerprint;
  const sameEventAsPrevious = previousSnapshot?.date === snapshot.date;
  const selectionChanged = Boolean(state.eventDate && state.eventDate !== event.date);

  const nextState = {
    ...state,
    eventDate: event.date,
    lastObservedFingerprint: currentFingerprint,
    snapshot: encryptSnapshot(snapshot),
  };

  if (isMatchInProgress(event, now)) {
    if (changed || !state.snapshot) writeState(nextState);
    console.log("Match is in progress; notification suppressed.");
    return;
  }

  const reserved = Number(event.reserved);
  const capacity = Number(event.capacity);

  if (!Number.isFinite(reserved)) {
    if (changed || !state.snapshot) writeState(nextState);
    console.log("Reserved count is unavailable.");
    return;
  }

  const weatherChanged = weatherDetailsChanged(previousSnapshot, snapshot);
  const detailsChanged = publicDetailsChanged(previousSnapshot, snapshot);
  if (weatherChanged) {
    fs.mkdirSync(".runtime/pickup", { recursive: true });
    fs.writeFileSync(".runtime/pickup/weather-refresh-needed", "1\n");
  }

  if (!detailsChanged && !selectionChanged) {
    if (changed || !state.snapshot) writeState(nextState);
    console.log("No public notification threshold or match-detail change.");
    return;
  }

  const capacityText = Number.isFinite(capacity) ? capacity : "?";
  const webLines = [];

  if (selectionChanged) {
    webLines.push(`🔄 Primary watch switched to ${formatDate(event.date)}`);
  }

  if (detailsChanged) {
    if (previousSnapshot?.locked !== snapshot.locked) {
      webLines.push(snapshot.locked ? "🔒 RSVP is now locked" : "🔓 RSVP reopened");
    }
    webLines.push("Match time or location details changed.");
  }

  webLines.push(
    `${reserved}/${capacityText} reserved - ${formatDate(event.date)}`,
    ...locationLines(snapshot),
    timeLine(event),
  );

  const webRecorded = await deliverPickupNotification({
    body: webLines.filter(Boolean).join("\n"),
    title: "Pickup details updated",
    tag: `pickup-${event.date}`,
  });

  writeState({
    ...nextState,
    lastSentAt: nowIso,
    lastSentFingerprint: currentFingerprint,
    lastSendReason: selectionChanged ? "selection-change" : "details-change",
  });

  console.log(
    `${webRecorded ? "Web" : "No"} notification recorded (${
      selectionChanged ? "selection change" : "match details change"
    }).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
