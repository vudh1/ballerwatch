/**
 * Stores encrypted 48-hour user conversation history for automated review.
 *
 * Documentation baseline: v5.8.0. Both exact exchanges and the sanitized
 * engineering-review projection are encrypted at rest on runtime-state.
 */
import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "./state-crypto.mjs";

const HISTORY_PATH = "state/chat-history.json";
const REVIEW_PATH = "state/chat-review.json";
const RETENTION_MS = 48 * 60 * 60 * 1000;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const MAX_ENTRIES = 200;

function cleanText(value, max = 1200) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function retainPrivateText(value, max = 12000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanExternalId(value) {
  const id = String(value || "").trim().slice(0, 120);
  return /^[A-Za-z0-9._:-]{8,120}$/.test(id) ? id : "";
}

function loadHistory() {
  try {
    const encrypted = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
    const payload = decryptState(encrypted);
    return payload && Array.isArray(payload.entries) ? payload : { version: 1, entries: [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

function prune(entries, now = Date.now()) {
  return entries
    .filter((entry) => {
      const created = Date.parse(String(entry?.createdAt || ""));
      return Number.isFinite(created) && now - created <= RETENTION_MS;
    })
    .slice(-MAX_ENTRIES);
}

function safeReview(entries) {
  return {
    version: 1,
    retentionHours: 48,
    generatedAt: new Date().toISOString(),
    signals: entries
      .filter((entry) => ["bug_candidate", "feature_candidate", "negative_feedback"].includes(entry.kind))
      .map((entry) => ({
        createdAt: entry.createdAt,
        kind: entry.kind,
        summary: cleanText(entry.summary, 220),
        reason: cleanText(entry.reason, 220),
      })),
  };
}

function writeReview(entries) {
  fs.writeFileSync(
    REVIEW_PATH,
    JSON.stringify(encryptState(safeReview(entries)), null, 2) + "\n",
  );
}

async function compactWithGroq(question, reply, hint = "") {
  if (!process.env.GROQ_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || GROQ_MODEL,
        temperature: 0,
        max_completion_tokens: 180,
        messages: [
          {
            role: "system",
            content: [
              "Summarize one BallerWatch user exchange for engineering review.",
              "Remove names, IDs, tokens, URLs, exact addresses, and other personal details.",
              "Do not quote the user.",
              "Classify as normal, bug_candidate, feature_candidate, or negative_feedback.",
              "bug_candidate means an existing supported behavior appears wrong or failed.",
              "feature_candidate means the user wants a capability BallerWatch does not currently support.",
              "negative_feedback means the user explicitly rejected a bot answer.",
              "Return JSON only with keys kind, summary, reason.",
              "summary must be a concise technical statement under 180 characters.",
              "reason must be under 180 characters.",
            ].join(" "),
          },
          {
            role: "user",
            content: `Hint: ${cleanText(hint, 80)}\nUser: ${cleanText(question, 600)}\nBot: ${cleanText(reply, 1000)}`,
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const raw = String(payload?.choices?.[0]?.message?.content || "");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const kinds = new Set(["normal", "bug_candidate", "feature_candidate", "negative_feedback"]);
    if (!kinds.has(parsed?.kind)) return null;
    return {
      kind: parsed.kind,
      summary: cleanText(parsed.summary, 220),
      reason: cleanText(parsed.reason, 220),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function recordChatExchange({
  question,
  reply,
  messageId = 0,
  hint = "",
  source = "telegram",
  externalId = "",
} = {}) {
  const q = retainPrivateText(question, 4000);
  const a = retainPrivateText(reply, 12000);
  if (!q && !a) return null;

  const compact = await compactWithGroq(q, a, hint);
  const fallbackKind = hint === "negative_feedback" ? "negative_feedback" : "normal";
  const safeExternalId = cleanExternalId(externalId);
  const entry = {
    createdAt: new Date().toISOString(),
    source: cleanText(source, 40) || "telegram",
    ...(Number(messageId) > 0 ? { messageId: Number(messageId) } : {}),
    ...(safeExternalId ? { externalId: safeExternalId } : {}),
    question: q,
    reply: a,
    kind: compact?.kind || fallbackKind,
    summary: compact?.summary || "Conversation retained for encrypted review; AI compaction was unavailable.",
    reason: compact?.reason || "",
  };

  const data = loadHistory();
  const prior = prune(data.entries || []).filter(
    (item) => !safeExternalId || item?.externalId !== safeExternalId,
  );
  data.entries = prune([...prior, entry]);
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(encryptState(data), null, 2) + "\n");
  writeReview(data.entries);
  return entry;
}

export function removeChatFeedback(externalId) {
  const id = cleanExternalId(externalId);
  if (!id) return false;

  const data = loadHistory();
  const before = prune(data.entries || []);
  const after = before.filter((entry) => entry?.externalId !== id);
  if (after.length === before.length) return false;

  data.entries = after;
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(encryptState(data), null, 2) + "\n");
  writeReview(data.entries);
  return true;
}

export function findChatExchange(messageId) {
  const id = Number(messageId || 0);
  if (!id) return null;
  const data = loadHistory();
  return prune(data.entries || [])
    .find((entry) => Number(entry?.messageId || 0) === id) || null;
}

export function refreshChatReview() {
  const data = loadHistory();
  data.entries = prune(data.entries || []);
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(encryptState(data), null, 2) + "\n");
  writeReview(data.entries);
  return data.entries.length;
}
