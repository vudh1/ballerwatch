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
import { parseTime, selectPrimaryEvent, weekStart } from "./selection.mjs";

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
  title = "Pickup update",
  tag = "ballerwatch-pickup",
}) {
  appendWebNotification("pickup", {
    title,
    body,
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

function eventForDate(date) {
  const event = readJson(`${RUNTIME_DATES_DIR}/${date}.json`);
  if (!event?.ok) return null;
  const privateEvents = readJson(RUNTIME_PATH)?.events || {};
  return {
    ...event,
    private: privateEvents[date] || {
      date,
      fieldName: "",
      address: "",
      locked: false,
      waitlistCount: 0,
      players: [],
      waitlist: [],
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
    const event = eventForDate(date);
    if (!event) continue;

    if (isDateSnoozed(settings, date)) {
      console.log("New-date alert suppressed by snooze.");
      continue;
    }

    const reserved = Number(event.reserved);
    const capacity = Number(event.capacity);
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

  const dates = index.dates
    .map((item) => String(item?.date || ""))
    .filter(Boolean);

  const selected = selectPrimaryEvent({
    dates,
    loadEvent: eventForDate,
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

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function normalizePerson(person) {
  return {
    name: String(person?.name || "").trim(),
    participantCount: Math.max(1, Number(person?.participantCount || 1)),
    withdrawRequested: Boolean(person?.withdrawRequested),
  };
}

function snapshotFromEvent(event) {
  return {
    date: event.date,
    fieldName: String(event.private.fieldName || ""),
    address: String(event.private.address || ""),
    locked: Boolean(event.private.locked),
    players: (Array.isArray(event.private.players) ? event.private.players : []).map(normalizePerson),
    waitlist: (Array.isArray(event.private.waitlist) ? event.private.waitlist : []).map(normalizePerson),
  };
}

function secureFingerprint(event, snapshot) {
  const canonical = {
    date: event.date,
    reserved: Number(event.reserved),
    capacity: event.capacity == null ? null : Number(event.capacity),
    startTime: String(event.startTime || ""),
    endTime: String(event.endTime || ""),
    snapshot,
  };

  return crypto
    .createHmac("sha256", stateKey())
    .update(JSON.stringify(canonical))
    .digest("hex");
}

function toMap(items) {
  return new Map(
    (Array.isArray(items) ? items : []).map((item) => [
      normalizeName(item.name),
      item,
    ]),
  );
}

function personSpots(person) {
  const count = Math.max(1, Number(person?.participantCount || 1));
  return count === 1 ? "1 spot" : `${count} spots`;
}

function diffRoster(previous, current) {
  if (!previous || previous.date !== current.date) return [];

  const changes = [];
  const prevPlayers = toMap(previous.players);
  const currPlayers = toMap(current.players);
  const prevWait = toMap(previous.waitlist);
  const currWait = toMap(current.waitlist);

  for (const [key, person] of currPlayers) {
    const before = prevPlayers.get(key);

    if (!before) {
      if (prevWait.has(key)) {
        changes.push(`• ${person.name} was promoted from the waitlist`);
      } else {
        changes.push(`• ${person.name} RSVP\'d for ${personSpots(person)}`);
      }
      continue;
    }

    if (Number(before.participantCount) !== Number(person.participantCount)) {
      changes.push(
        `• ${person.name} changed RSVP from ${personSpots(before)} to ${personSpots(person)}`,
      );
    }

    if (!before.withdrawRequested && person.withdrawRequested) {
      changes.push(`• ${person.name} requested to withdraw`);
    } else if (before.withdrawRequested && !person.withdrawRequested) {
      changes.push(`• ${person.name} canceled the withdraw request`);
    }
  }

  for (const [key, person] of prevPlayers) {
    if (currPlayers.has(key)) continue;
    if (currWait.has(key)) {
      changes.push(`• ${person.name} moved to the waitlist`);
    } else if (person.withdrawRequested) {
      changes.push(`• ${person.name} withdrew`);
    } else {
      changes.push(`• ${person.name} removed the RSVP`);
    }
  }

  for (const [key, person] of currWait) {
    if (prevWait.has(key) || prevPlayers.has(key)) continue;
    changes.push(`• ${person.name} joined the waitlist for ${personSpots(person)}`);
  }

  for (const [key, person] of prevWait) {
    if (currWait.has(key) || currPlayers.has(key)) continue;
    changes.push(`• ${person.name} left the waitlist`);
  }

  if (previous.fieldName !== current.fieldName || previous.address !== current.address) {
    changes.push("• Match location was updated");
  }

  return changes;
}

function ownerStatus(snapshot, settings) {
  const myName = normalizeName(settings?.ownerRsvpName || process.env.OWNER_RSVP_NAME);
  if (!myName || !snapshot) {
    return { confirmed: false, waitlisted: false, waitlistPosition: null };
  }

  const playerIndex = (snapshot.players || []).findIndex(
    (person) => normalizeName(person.name) === myName,
  );
  const waitlistIndex = (snapshot.waitlist || []).findIndex(
    (person) => normalizeName(person.name) === myName,
  );

  return {
    confirmed: playerIndex >= 0,
    waitlisted: waitlistIndex >= 0,
    waitlistPosition: waitlistIndex >= 0 ? waitlistIndex + 1 : null,
  };
}

function ownerChangeLines(previous, current) {
  if (!previous) return [];

  if (previous.waitlisted && current.confirmed) {
    return ["✅ YOU ARE NOW CONFIRMED — promoted from waitlist"];
  }

  if (!previous.waitlisted && current.waitlisted) {
    return [`🎟️ YOU ARE ON THE WAITLIST — position #${current.waitlistPosition}`];
  }

  if (
    previous.waitlisted &&
    current.waitlisted &&
    previous.waitlistPosition !== current.waitlistPosition
  ) {
    return [
      `🎟️ WAITLIST POSITION: #${previous.waitlistPosition} → #${current.waitlistPosition}`,
    ];
  }

  if ((previous.confirmed || previous.waitlisted) && !current.confirmed && !current.waitlisted) {
    return ["⚠️ YOU ARE NO LONGER CONFIRMED OR ON THE WAITLIST"];
  }

  return [];
}

function ownerCurrentLine(status) {
  if (status.waitlisted) {
    return `🎟️ YOU ARE ON THE WAITLIST — position #${status.waitlistPosition}`;
  }
  if (status.confirmed) {
    return "✅ YOU ARE CONFIRMED";
  }
  return "";
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

async function main() {
  const now = pacificParts();
  const nowIso = new Date().toISOString();
  let state = readState();
  const settings = loadUserSettings();

  state = await processNewDates(state, now, settings);
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
  const currentOwner = ownerStatus(snapshot, settings);
  const previousOwner =
    previousSnapshot?.date === snapshot.date ? ownerStatus(previousSnapshot, settings) : null;
  const ownerChanges = ownerChangeLines(previousOwner, currentOwner);
  const ownerStatusChanged = ownerChanges.length > 0;

  const ownerSuppressionActive =
    currentOwner.confirmed &&
    !(!snapshot.locked && Number(event.reserved) <= 16) &&
    !ownerStatusChanged;

  if (ownerSuppressionActive) {
    console.log("Owner is already confirmed; notification suppressed.");
    return;
  }

  const changed = state.lastObservedFingerprint !== currentFingerprint;
  const sameEventAsPrevious = previousSnapshot?.date === snapshot.date;
  const selectionChanged = Boolean(state.eventDate && state.eventDate !== event.date);
  const rosterChanges = diffRoster(previousSnapshot, snapshot);

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

  const remaining = Number.isFinite(capacity) ? capacity - reserved : null;
  const urgentCapacity = Number.isFinite(remaining) && remaining > 0 && remaining < 4;
  const isFull = Number.isFinite(remaining) && remaining <= 0;

  if (!changed && !ownerStatusChanged) {
    console.log("No meaningful pickup change; duplicate notification suppressed.");
    return;
  }

  const capacityText = Number.isFinite(capacity) ? capacity : "?";
  const lines = [];

  if (urgentCapacity) {
    lines.push(
      `🚨 ONLY ${remaining} ${remaining === 1 ? "SPOT" : "SPOTS"} LEFT`,
    );
  } else if (isFull) {
    lines.push("⛔ RSVP FULL");
  }

  if (ownerChanges.length) {
    lines.push(...ownerChanges);
  } else {
    const personalStatus = ownerCurrentLine(currentOwner);
    if (personalStatus) lines.push(personalStatus);
  }

  if (selectionChanged) {
    lines.push(`🔄 Primary watch switched to ${formatDate(event.date)}`);
  }

  lines.push(
    `${reserved}/${capacityText} reserved - ${formatDate(event.date)}`,
    ...locationLines(snapshot),
    timeLine(event),
  );

  if (changed && previousSnapshot && sameEventAsPrevious) {
    lines.push("", "Changes:");
    if (rosterChanges.length) {
      lines.push(...rosterChanges);
    } else {
      lines.push("• RSVP status changed, but the person/action could not be identified from the site data.");
    }
  }

  const webLines = [];
  if (urgentCapacity) {
    webLines.push(
      `🚨 ONLY ${remaining} ${remaining === 1 ? "SPOT" : "SPOTS"} LEFT`,
    );
  } else if (isFull) {
    webLines.push("⛔ RSVP FULL");
  }
  if (selectionChanged) {
    webLines.push(`🔄 Primary watch switched to ${formatDate(event.date)}`);
  }
  webLines.push(
    `${reserved}/${capacityText} reserved - ${formatDate(event.date)}`,
    ...locationLines(snapshot),
    timeLine(event),
  );
  if (changed && sameEventAsPrevious) {
    webLines.push("RSVP list or match details changed.");
  }

  const webRecorded = await deliverPickupNotification({
    body: lines.filter(Boolean).join("\n"),
    webText: webLines.filter(Boolean).join("\n"),
    title: urgentCapacity
      ? `Pickup: ${remaining} ${remaining === 1 ? "spot" : "spots"} left`
      : isFull
        ? "Pickup RSVP full"
        : "Pickup update",
    tag: `pickup-${event.date}`,
  });

  writeState({
    ...nextState,
    lastSentAt: nowIso,
    lastSentFingerprint: currentFingerprint,
    lastSendReason: ownerStatusChanged
      ? "owner-status-change"
      : urgentCapacity
        ? "change-urgent-capacity"
        : "change",
  });

  // Never log notification message content: workflow logs are public.
  console.log(
    `${webRecorded ? "Web" : "No"} notification recorded (${
      ownerStatusChanged
        ? "owner status change"
        : urgentCapacity
          ? "site change + urgent capacity"
          : "site change"
    }).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
