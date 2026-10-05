import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveFailoverState, restoreFailoverState } from "../../../backend/shared/failover-state.mjs";

test("encrypted failover backup round-trips runtime files", () => {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-failover-"));
  process.env.TRACKER_STATE_KEY = "test-only-failover-key";

  try {
    process.chdir(dir);
    fs.mkdirSync("pickup/state", { recursive: true });
    fs.mkdirSync("state", { recursive: true });
    fs.writeFileSync("pickup/state/feed.json", "{\"ok\":true}\n");
    fs.writeFileSync("state/user.json", "{\"v\":1}\n");

    assert.equal(saveFailoverState("pickup"), 2);
    const encrypted = fs.readFileSync(".runtime/failover/pickup.json", "utf8");
    assert.equal(encrypted.includes('"ok":true'), false);

    fs.rmSync("pickup/state/feed.json");
    fs.rmSync("state/user.json");
    assert.equal(restoreFailoverState("pickup"), 2);
    assert.equal(fs.readFileSync("pickup/state/feed.json", "utf8"), "{\"ok\":true}\n");
  } finally {
    process.chdir(previous);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
