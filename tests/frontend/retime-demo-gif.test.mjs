import assert from "node:assert/strict";
import test from "node:test";
import { gifDelays, retimeGif } from "../../scripts/retime-demo-gif.mjs";

// A one-pixel GIF, repeated as two frames to verify full frame preservation.
const sample = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
function twoFrameGif() {
  const gce = sample.indexOf(Buffer.from([0x21, 0xf9, 0x04]));
  const bytes = Buffer.concat([sample.subarray(0, -1), sample.subarray(gce)]);
  const stats = gifDelays(bytes);
  for (const frame of stats.delays) bytes.writeUInt16LE(5, frame.offset);
  return bytes;
}
test("lossless GIF retiming preserves every frame and byte outside delay fields", () => {
  const original = twoFrameGif();
  const before = gifDelays(original);
  assert.equal(before.images, 2);
  assert.equal(before.centiseconds, 10);
  const changed = retimeGif(original, 0.06);
  assert.equal(changed.after.images, 2);
  assert.equal(changed.after.centiseconds, 6);
  assert.equal(changed.bytes.length, original.length);
  const timingBytes = new Set(before.delays.flatMap(({ offset }) => [offset, offset + 1]));
  for (let i = 0; i < original.length; i += 1) {
    if (!timingBytes.has(i)) assert.equal(changed.bytes[i], original[i], `Modified non-timing byte at ${i}`);
  }
  assert.equal(retimeGif(changed.bytes, 0.06).changed, false);
});
test("GIF retiming refuses targets below browser-safe per-frame delays", () => {
  assert.throws(() => retimeGif(twoFrameGif(), 0.02), /Target too short/);
});
