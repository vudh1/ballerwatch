import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadUserSettings,
  saveUserState,
  USER_STATE_PATH,
} from "../../../backend/shared/user-state.mjs";
import { isEncryptedStateEnvelope } from "../../../backend/shared/state-crypto.mjs";

test("encrypted user state preserves bounded cross-device notification profiles", (t) => {
  const cwd = process.cwd();
  const env = process.env;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-user-state-"));
  process.chdir(dir);
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-user-state-key" };
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const readIds = Array.from({ length: 305 }, (_, index) => `read-${index}`);
  assert.equal(saveUserState({
    ownerRsvpName: "Synthetic User",
    notificationProfiles: {
      admin: {
        readIds,
        deletedIds: ["deleted-1", "deleted-1", "deleted-2"],
        channels: { pickup: true, league: false, version: true },
        updatedAt: "2026-10-05T21:00:00.000Z",
      },
    },
  }), true);

  const envelope = JSON.parse(fs.readFileSync(USER_STATE_PATH, "utf8"));
  assert.equal(isEncryptedStateEnvelope(envelope), true);
  const profile = loadUserSettings().notificationProfiles.admin;
  assert.equal(profile.readIds.length, 300);
  assert.equal(profile.readIds[0], "read-5");
  assert.deepEqual(profile.deletedIds, ["deleted-1", "deleted-2"]);
  assert.deepEqual(profile.channels, {
    pickup: true,
    league: false,
    version: true,
  });
});
