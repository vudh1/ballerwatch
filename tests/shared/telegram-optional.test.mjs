import test from "node:test";
import assert from "node:assert/strict";

import {
  isOwnerChat,
  sendTelegram,
  sendTyping,
  telegramConfigured,
} from "../../shared/telegram.mjs";

test("Telegram adapter can be absent without breaking web/runtime imports", async () => {
  assert.equal(telegramConfigured(), false);
  assert.equal(isOwnerChat("123"), false);
  await assert.rejects(sendTelegram("test"), /Telegram adapter is not configured/);
  await assert.doesNotReject(sendTyping());
});
