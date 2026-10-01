import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildTelegramText,
  formatTime,
  jerseyIcon,
  notifyTelegram,
} from "../../league/telegram-notify.mjs";

test("formatting preserves Pacific time and jersey icon behavior", () => {
  assert.equal(formatTime("2026-10-05T19:15:00-07:00"), "Mon 10/05 7:15 PM");
  assert.equal(jerseyIcon("Black"), "⚫");
  assert.equal(jerseyIcon("Purple / White"), "⚪");
});

test("schedule update sends exactly one Telegram request", async () => {
  const originalCwd = process.cwd();
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChat = process.env.TELEGRAM_CHAT_ID;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-telegram-"));

  try {
    process.chdir(dir);
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "chat";
    const updates = [{
      action: "updated",
      match: {
        team: "Team <Alpha>",
        opponent: "Opponent",
        start: "2026-10-05T19:15:00-07:00",
        location: "Field",
        jerseyColor: "Black",
        opponentJerseyColor: "White",
        mapUrl: "https://example.invalid/map?a=1&b=2",
      },
    }];
    fs.writeFileSync("telegram-update.json", JSON.stringify({updates}));

    let requests = 0;
    let body;
    const sent = await notifyTelegram({
      fetchImpl: async (_url, options) => {
        requests += 1;
        body = options.body;
        return {ok: true, status: 200, json: async () => ({ok: true})};
      },
    });

    assert.equal(sent, true);
    assert.equal(requests, 1);
    const params = new URLSearchParams(body);
    assert.equal(params.get("chat_id"), "chat");
    assert.ok(params.get("text").includes("Updated:"));
    assert.ok(params.get("text").includes("Team &lt;Alpha&gt;"));
  } finally {
    process.chdir(originalCwd);
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChat;
  }
});

test("notification builder remains one schedule-change message", () => {
  const text = buildTelegramText([{
    action: "created",
    match: {
      team: "A",
      opponent: "B",
      start: null,
      location: null,
      jerseyColor: null,
      opponentJerseyColor: null,
    },
  }]);
  assert.ok(text.startsWith("RATS schedule updated\nAdded:"));
  assert.equal(text.match(/RATS schedule updated/g)?.length, 1);
});
