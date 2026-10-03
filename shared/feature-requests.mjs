/**
 * Stores feature-request context and its privacy-safe aggregate projection encrypted at rest.
 *
 * Documentation baseline: v5.8.0. The public API may expose the allowlisted projection,
 * but every runtime-state branch file remains an AES-GCM envelope.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { decryptState, encryptState } from "./state-crypto.mjs";
import {
  isPublicRequestSummary,
  publicRequestSummary,
  requestCategory,
  REQUEST_CATEGORIES,
} from "./feature-request-summary.mjs";

export {
  isPublicRequestSummary,
  publicRequestSummary,
  requestCategory,
  REQUEST_CATEGORIES,
};

function loadPrivate(directory) {
  const file = path.join(directory, "private.json");
  if (!fs.existsSync(file)) return { version: 1, requests: [] };
  let data;
  try { data = decryptState(JSON.parse(fs.readFileSync(file, "utf8"))); } catch {}
  // Do not silently replace an existing archive when its key is unavailable.
  if (!data || !Array.isArray(data.requests)) throw new Error("Unable to decrypt private feature requests.");
  return data;
}

function writeEncryptedSummary(directory, requests) {
  fs.writeFileSync(
    path.join(directory, "unknown.json"),
    JSON.stringify(encryptState(publicRequestSummary(requests)), null, 2) + "\n",
  );
}

export function refreshPublicRequests(directory = "requests") {
  const data = loadPrivate(directory);
  fs.mkdirSync(directory, { recursive: true });
  writeEncryptedSummary(directory, data.requests);
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
  writeEncryptedSummary(directory, data.requests);
  return request.id;
}
