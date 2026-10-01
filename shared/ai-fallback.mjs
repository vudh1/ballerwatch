/**
 * Provides bounded Groq fallback answering for questions deterministic routing cannot handle.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
export const DAILY_AI_LIMIT = 25;
export const AI_TIMEOUT_MS = 2500;

function cleanText(value, max = 1000) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function aiBudget(settings = {}) {
  const day = todayUtc();
  const storedDay = String(settings.aiUsageDate || "");
  const used = storedDay === day ? Math.max(0, Number(settings.aiUsageCount || 0)) : 0;
  return { day, used, remaining: Math.max(0, DAILY_AI_LIMIT - used) };
}

export function aiConfigured() {
  // BallerWatch is intentionally free-tier-only. A Groq API key enables the
  // fallback, but the repository never supports opting into paid AI usage.
  return Boolean(cleanText(process.env.GROQ_API_KEY));
}

function parseDecision(text) {
  const raw = String(text || "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { parsed = JSON.parse(match[0]); } catch { return null; }
  }

  if (parsed?.action === "answer") {
    const reply = cleanText(parsed.reply, 1200);
    return reply ? { action: "answer", reply } : null;
  }
  if (parsed?.action === "feature_request") {
    return {
      action: "feature_request",
      reason: cleanText(parsed.reason, 500) || "The available BallerWatch data is insufficient.",
      category: ["schedule","rsvp","notifications","league","setup","other"].includes(parsed.category)
        ? parsed.category
        : "other",
    };
  }
  return null;
}

export async function answerUnknownWithAi(question, context, settings = {}) {
  if (!aiConfigured()) {
    return { decision: null, settings, reason: "ai_not_configured" };
  }

  const budget = aiBudget(settings);
  if (budget.remaining <= 0) {
    return { decision: null, settings, reason: "daily_limit_reached" };
  }

  const nextSettings = {
    ...settings,
    aiUsageDate: budget.day,
    aiUsageCount: budget.used + 1,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.1,
        max_completion_tokens: 300,
        messages: [
          {
            role: "system",
            content: [
              "You are BallerWatch's read-only fallback assistant.",
              "Answer only from the supplied BallerWatch context and ordinary reasoning.",
              "Never claim to perform an action, change state, book anything, modify calendars, RSVP, send messages, or access information not present in context.",
              "If the request needs unavailable information, a new capability, external lookup, or an unsupported action, return feature_request.",
              "Be concise.",
              'Return JSON only: {"action":"answer","reply":"..."} or {"action":"feature_request","reason":"...","category":"schedule|rsvp|notifications|league|setup|other"}.',
            ].join(" "),
          },
          {
            role: "user",
            content: `Question: ${cleanText(question, 600)}\n\nBallerWatch context:\n${cleanText(context, 6000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return { decision: null, settings: nextSettings, reason: `http_${response.status}` };
    }

    const payload = await response.json().catch(() => null);
    const text = payload?.choices?.[0]?.message?.content;
    const decision = parseDecision(text);
    return {
      decision,
      settings: nextSettings,
      reason: decision ? "ok" : "invalid_response",
    };
  } catch (error) {
    return {
      decision: null,
      settings: nextSettings,
      reason: error?.name === "AbortError" ? "timeout" : "request_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
