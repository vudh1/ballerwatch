/**
 * Stores private feature-request context and produces only a privacy-safe aggregate summary.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { decryptState, encryptState } from "./state-crypto.mjs";

export const REQUEST_CATEGORIES = Object.freeze([
  "schedule", "rsvp", "notifications", "league", "setup", "other",
]);

export function requestCategory(question) {
  const text = String(question || "").toLowerCase();
  if (/\b(schedule|game|match|when|today|tomorrow)\b/.test(text)) return "schedule";
  if (/\b(rsvp|waitlist|reserved|capacity|count|players)\b/.test(text)) return "rsvp";
  if (/\b(notify|notification|notifications|mute|snooze|alert)\b/.test(text)) return "notifications";
  if (/\b(league|team|teams|score)\b/.test(text)) return "league";
  if (/\b(setup|configure|endpoint|owner)\b/.test(text)) return "setup";
  return "other";
}

// Construct a new allowlisted object. Never copy request fields into public data.
export function publicRequestSummary(requests) {
  const counts = new Map(REQUEST_CATEGORIES.map(category => [category, 0]));
  for (const request of requests) {
    const category = requestCategory(request.question);
    const count = Number.isSafeInteger(request.count) && request.count > 0 ? request.count : 1;
    counts.set(category, Math.min(Number.MAX_SAFE_INTEGER, counts.get(category) + count));
  }
  const feedback = new Map(REQUEST_CATEGORIES.map(category => [category, { manual: 0, thumbsDown: 0 }]));
  for (const request of requests) {
    const category = requestCategory(request.question);
    const source = String(request.source || "");
    if (source === "manual") feedback.get(category).manual += 1;
    if (source === "thumbs_down") feedback.get(category).thumbsDown += 1;
  }
  return {
    version: 3,
    requests: REQUEST_CATEGORIES.filter(category => counts.get(category) > 0)
      .map(category => ({
        category,
        count: counts.get(category),
        manual: feedback.get(category).manual,
        thumbsDown: feedback.get(category).thumbsDown,
      })),
  };
}

export function isPublicRequestSummary(value) {
  const exact = (obj, keys) => obj && typeof obj === "object" && !Array.isArray(obj)
    && Object.keys(obj).length === keys.length && keys.every(key => Object.hasOwn(obj, key));
  if (!exact(value, ["version", "requests"]) || value.version !== 3 || !Array.isArray(value.requests)) return false;
  const seen = new Set();
  return value.requests.every(request => {
    if (!exact(request, ["category", "count", "manual", "thumbsDown"]) || !REQUEST_CATEGORIES.includes(request.category)
      || !Number.isSafeInteger(request.count) || request.count < 1
      || !Number.isSafeInteger(request.manual) || request.manual < 0
      || !Number.isSafeInteger(request.thumbsDown) || request.thumbsDown < 0
      || request.manual + request.thumbsDown > request.count
      || seen.has(request.category)) return false;
    seen.add(request.category);
    return true;
  });
}

function loadPrivate(directory) {
  const file = path.join(directory, "private.json");
  if (!fs.existsSync(file)) return { version: 1, requests: [] };
  let data;
  try { data = decryptState(JSON.parse(fs.readFileSync(file, "utf8"))); } catch {}
  // Do not silently replace an existing archive when its key is unavailable.
  if (!data || !Array.isArray(data.requests)) throw new Error("Unable to decrypt private feature requests.");
  return data;
}

export function refreshPublicRequests(directory = "requests") {
  const data = loadPrivate(directory);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "unknown.json"), JSON.stringify(publicRequestSummary(data.requests), null, 2) + "\n");
}

export function recordUnknownQuestion(question, directory = "requests", metadata = {}) {
  const original = String(question || "").trim().replace(/\s+/g, " ").slice(0, 500);
  if (!original) return null;
  const data = loadPrivate(directory);
  const now = new Date().toISOString();
  let request = data.requests.find(item => String(item.question || "").toLowerCase() === original.toLowerCase());
  if (request) {
    request.count = (Number.isSafeInteger(request.count) && request.count > 0 ? request.count : 1) + 1;
    request.lastSeenAt = now;
    if (metadata?.source) request.source = String(metadata.source).slice(0, 50);
    if (metadata?.rejectedAnswer) request.rejectedAnswer = String(metadata.rejectedAnswer).slice(0, 1200);
    if (metadata?.aiCategory) request.aiCategory = String(metadata.aiCategory).slice(0, 50);
    if (metadata?.aiReason) request.aiReason = String(metadata.aiReason).slice(0, 500);
    if (request.status === "implemented") request.status = "reopened";
  } else {
    request = {
      id: crypto.randomUUID(),
      question: original,
      count: 1,
      status: "open",
      firstSeenAt: now,
      lastSeenAt: now,
      ...(metadata?.source ? { source: String(metadata.source).slice(0, 50) } : {}),
      ...(metadata?.rejectedAnswer ? { rejectedAnswer: String(metadata.rejectedAnswer).slice(0, 1200) } : {}),
      ...(metadata?.aiCategory ? { aiCategory: String(metadata.aiCategory).slice(0, 50) } : {}),
      ...(metadata?.aiReason ? { aiReason: String(metadata.aiReason).slice(0, 500) } : {}),
    };
    data.requests.push(request);
  }
  data.requests = data.requests.slice(-100);
  // Encrypt successfully before writing either file; IDs and timestamps stay private.
  const encrypted = encryptState(data);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "private.json"), JSON.stringify(encrypted, null, 2) + "\n");
  fs.writeFileSync(path.join(directory, "unknown.json"), JSON.stringify(publicRequestSummary(data.requests), null, 2) + "\n");
  return request.id;
}
