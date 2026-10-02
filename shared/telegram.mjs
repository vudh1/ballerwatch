/**
 * Sends Telegram actions/messages without logging sensitive message content.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();

export function telegramConfigured() {
  return Boolean(TOKEN && CHAT_ID);
}

function requireTelegram() {
  if (!telegramConfigured()) {
    throw new Error("Telegram adapter is not configured.");
  }
}

export function isOwnerChat(chatId) {
  return telegramConfigured() && String(chatId) === String(CHAT_ID);
}

export async function getTelegramUpdates(offset = 0, timeoutSeconds = 0) {
  requireTelegram();
  const url = new URL(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
  if (offset) url.searchParams.set("offset", String(offset));
  if (timeoutSeconds > 0) url.searchParams.set("timeout", String(timeoutSeconds));
  url.searchParams.set("allowed_updates", JSON.stringify(["message"]));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (Math.max(0, timeoutSeconds) + 15) * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new Error(`Telegram getUpdates failed: ${payload.description || `HTTP ${response.status}`}`);
    }
    return Array.isArray(payload.result) ? payload.result : [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegram(message, extra = {}) {
  requireTelegram();
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      disable_notification: false,
      disable_web_page_preview: true,
      ...extra,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(`Telegram sendMessage failed: ${payload.description || `HTTP ${response.status}`}`);
  }
  return payload.result || null;
}


export async function sendTyping() {
  if (!telegramConfigured()) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        action: "typing",
      }),
    });
    if (!response.ok) {
      console.warn(`Telegram typing indicator failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`Telegram typing indicator failed: ${error?.message || error}`);
  }
}
