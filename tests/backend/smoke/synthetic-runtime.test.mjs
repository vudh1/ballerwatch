import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { encryptState } from "../../../backend/shared/state-crypto.mjs";

test("manual smoke verifier accepts encrypted synthetic pickup and league state without delivery", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-smoke-"));
  const previousKey = process.env.TRACKER_STATE_KEY;
  t.after(() => {
    fs.rmSync(directory, {recursive: true, force: true});
    if (previousKey === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previousKey;
  });
  process.env.TRACKER_STATE_KEY = "synthetic-smoke-key-never-deployed";
  fs.mkdirSync(path.join(directory, "pickup/state"), {recursive: true});
  fs.mkdirSync(path.join(directory, "league"), {recursive: true});
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const feed = {
    ok: true,
    dates: [{date}],
    events: {[date]: {
      ok: true, date, startTime: "19:00", endTime: "21:00",
      reserved: 4, capacity: 16,
    }},
  };
  const privateEvents = {
    events: {[date]: {
      fieldName: "Synthetic Field", players: [], waitlist: [],
    }},
  };
  fs.writeFileSync(path.join(directory, "pickup/state/feed.json"),
    JSON.stringify(encryptState(feed)));
  fs.writeFileSync(path.join(directory, "pickup/state/events.json"),
    JSON.stringify(encryptState(privateEvents)));
  fs.writeFileSync(path.join(directory, "league/schedule.json"),
    JSON.stringify({ok: true, teams: []}));
  const script = fileURLToPath(new URL("./manual-smoke.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: "utf8",
    env: {...process.env},
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Manual smoke test passed/);
});
