import test from "node:test";
import assert from "node:assert/strict";
import { DEVICE_LEASE_MS, readDeviceLease, writeDeviceLease }
  from "../../frontend/web/lib/device-lease.js";

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test("device-only values expire and are removed exactly after 24 hours", () => {
  const s=storage(), t=Date.parse("2026-10-16T07:00:00Z");
  assert.equal(writeDeviceLease(s,"guest",{name:"Sam"},t),true);
  assert.deepEqual(readDeviceLease(s,"guest",t+DEVICE_LEASE_MS-1),{name:"Sam"});
  assert.equal(readDeviceLease(s,"guest",t+DEVICE_LEASE_MS),null);
  assert.equal(s.getItem("guest"),null);
});
test("untrusted, legacy and future-dated leases fail closed", () => {
  const s=storage(), t=1_000_000;
  s.setItem("guest",JSON.stringify({schema:1,expiresAt:t+DEVICE_LEASE_MS*2,data:{name:"Sam"}}));
  assert.equal(readDeviceLease(s,"guest",t),null);
  s.setItem("guest","{not-json}");
  assert.equal(readDeviceLease(s,"guest",t),null);
  s.setItem("guest",JSON.stringify({name:"legacy"}));
  assert.equal(readDeviceLease(s,"guest",t),null);
});
