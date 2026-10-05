/**
 * Stores public-safe web notification-board entries in encrypted runtime state.
 *
 * v3.0.0: callers must provide already-sanitized text. The files are encrypted at rest
 * even though the Worker exposes their public-safe projections to the installed web app.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { decryptState, encryptState } from "./state-crypto.mjs";

const CHANNEL_PATHS = Object.freeze({
  pickup: "state/web-board-pickup.json",
  league: "state/web-board-league.json",
  version: "state/web-board-version.json",
});

function clean(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function boardPath(channel) {
  const file = CHANNEL_PATHS[channel];
  if (!file) throw new Error(`Unknown web notification channel: ${channel}`);
  return file;
}

export function loadWebNotificationChannel(channel) {
  const file = boardPath(channel);
  try {
    const encrypted = JSON.parse(fs.readFileSync(file, "utf8"));
    const value = decryptState(encrypted);
    return value && Array.isArray(value.entries)
      ? value
      : { version: 1, entries: [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

export function appendWebNotification(channel, entry, { now = new Date() } = {}) {
  const file = boardPath(channel);
  const current = loadWebNotificationChannel(channel);
  const createdAt = String(entry?.createdAt || now.toISOString());
  const nextEntry = {
    id: clean(entry?.id, 120) || crypto.randomUUID(),
    channel,
    createdAt,
    title: clean(entry?.title, 120) || "BallerWatch update",
    body: clean(entry?.body, 900),
    url: clean(entry?.url, 500) || "https://vudh1.github.io/ballerwatch/",
    tag: clean(entry?.tag, 120) || `ballerwatch-${channel}`,
  };

  const duplicate = [...current.entries]
    .reverse()
    .find((item) =>
      clean(item?.tag, 120) === nextEntry.tag &&
      clean(item?.title, 120) === nextEntry.title &&
      clean(item?.body, 900) === nextEntry.body &&
      clean(item?.url, 500) === nextEntry.url
    );
  if (duplicate) return duplicate;

  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const entries = [...current.entries, nextEntry]
    .filter((item) => Date.parse(String(item?.createdAt || "")) >= cutoff)
    .slice(-40);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(encryptState({ version: 1, entries }), null, 2) + "\n",
  );
  fs.mkdirSync(".runtime", { recursive: true });
  fs.writeFileSync(
    ".runtime/web-push-pending",
    JSON.stringify({ channel, id: nextEntry.id, createdAt: nextEntry.createdAt }) + "\n",
  );
  return nextEntry;
}
