import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { decryptState, encryptState } from "../../../backend/shared/state-crypto.mjs";

test("real pickup watcher writes one encrypted alert per threshold and per new spot after 75%", t => {
  const priorKey = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-rsvp-capacity-only-test-secret";
  t.after(() => {
    if (priorKey === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = priorKey;
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-rsvp-milestones-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const eventsPath = path.join(root, ".runtime/pickup/events.json");
  const datesDir = path.join(root, ".runtime/pickup/data/dates");
  const notifyPath = path.join(root, "pickup/state/notify.json");
  const boardPath = path.join(root, "state/web-board-pickup.json");
  const pendingPath = path.join(root, ".runtime/web-push-pending");
  const settingsPath = path.join(root, "state/user.json");
  const firstDate = "2099-10-08";
  const secondDate = "2099-10-15";
  fs.mkdirSync(datesDir, { recursive: true });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(path.join(root, ".runtime/pickup/data/index.json"), JSON.stringify({
    ok: true, dates: [{date:firstDate}, {date:secondDate}],
  }));
  fs.writeFileSync(eventsPath, JSON.stringify({
    events: {
      [firstDate]: { fieldName: "Synthetic Pickup Field", address: "Synthetic City" },
      [secondDate]: { fieldName: "Other Synthetic Pickup Field", address: "Synthetic City" },
    },
  }));
  const writeCount = (date, reserved, capacity) => fs.writeFileSync(
    path.join(datesDir, date + ".json"),
    JSON.stringify({ ok:true, date, reserved, capacity, startTime:"20:00", endTime:"22:00" }),
  );
  const setMute = mutedDates => fs.writeFileSync(settingsPath,
    JSON.stringify(encryptState({settings:{mutedDates}})));

  function run() {
    const proc = spawnSync(process.execPath,
      [path.resolve("backend/pickup/notify.mjs")], {
        cwd: root, encoding: "utf8",
        env: {...process.env, TRACKER_STATE_KEY:process.env.TRACKER_STATE_KEY},
      });
    assert.equal(proc.status,0,(proc.stderr || proc.stdout).slice(0,400));
  }
  function board() {
    if (!fs.existsSync(boardPath)) return [];
    const value = decryptState(JSON.parse(fs.readFileSync(boardPath,"utf8")));
    return value.entries.filter(entry => entry.tag.startsWith("pickup-capacity-"));
  }
  function expectAlert(date, count, label) {
    const items = board().filter(item => item.tag === `pickup-capacity-${date}-${count}`);
    assert.equal(items.length,1,`expected single ${label} alert at ${count}`);
    assert.match(items[0].title,label);
    assert.ok(fs.existsSync(pendingPath), "web push marker queued");
    const encrypted = fs.readFileSync(boardPath,"utf8");
    assert.doesNotMatch(encrypted,/Synthetic Pickup Field|20:00|reserved/);
    fs.rmSync(pendingPath);
  }

  writeCount(firstDate,3,16);
  writeCount(secondDate,0,20);
  run();
  assert.equal(board().length,0,"initial observation seeds baseline silently");
  assert.equal(fs.existsSync(pendingPath),false);
  assert.ok(fs.existsSync(notifyPath),"baseline saved in encrypted runtime state");

  for (const [count,title] of [
    [4,/25%/], [8,/50%/], [12,/75%/], [13,/3 spots left/],
    [14,/2 spots left/], [15,/1 spot left/], [16,/full/],
  ]) {
    writeCount(firstDate,count,16);
    run();
    expectAlert(firstDate,count,title);
    const n=board().length;
    run();
    assert.equal(board().length,n,"unchanged RSVP count must not notify again");
    assert.equal(fs.existsSync(pendingPath),false);
  }

  // A later game still gets its own alert even if the spotlight watches
  // the first date; muted-date changes must not be replayed upon unmute.
  writeCount(secondDate,5,20);
  setMute([secondDate]);
  run();
  assert.equal(board().length,7,"muted date does not notify");
  setMute([]);
  writeCount(secondDate,6,20);
  run();
  assert.equal(board().length,7,"unmuting doesn't replay old 25% milestone");
  writeCount(secondDate,10,20);
  run();
  expectAlert(secondDate,10,/50%/);
  assert.equal(board().length,8);
});
