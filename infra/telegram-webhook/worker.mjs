function base64Json(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function telegram(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function dispatchGitHub(env, update) {
  const response = await fetch(
    "https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/listener.yml/dispatches",
    {
      method: "POST",
      headers: {
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        "content-type": "application/json",
        "user-agent": "ballerwatch-telegram-webhook",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { telegram_update_b64: base64Json(update) },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub dispatch failed: HTTP ${response.status}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "ballerwatch-telegram-webhook" });
    }
    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    const secret = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const chatId = update?.message?.chat?.id;
    if (chatId == null || String(chatId) !== String(env.TELEGRAM_CHAT_ID)) {
      return new Response("Ignored", { status: 200 });
    }

    const typingPromise = telegram(env, "sendChatAction", {
      chat_id: env.TELEGRAM_CHAT_ID,
      action: "typing",
    }).catch(() => null);

    try {
      await Promise.all([typingPromise, dispatchGitHub(env, update)]);
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error(error);
      return new Response("Temporary failure", { status: 502 });
    }
  },
};
