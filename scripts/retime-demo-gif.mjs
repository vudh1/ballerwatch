/**
 * Retime a GIF without re-encoding pixels or removing any image frames.
 * Each graphics-control block contains a frame delay in centiseconds.
 * Usage: node scripts/retime-demo-gif.mjs [docs/demo.gif] [target seconds]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function gifDelays(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 14 ||
      !["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) {
    throw new Error("Expected a complete GIF file");
  }
  const readSubBlocks = (at) => {
    while (at < bytes.length) {
      const size = bytes[at++];
      if (size === 0) return at;
      at += size;
      if (at > bytes.length) break;
    }
    throw new Error("Malformed GIF sub-blocks");
  };
  const colorTableSize = (packed) => packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0;
  let at = 13 + colorTableSize(bytes[10]);
  const delays = [];
  let images = 0;
  let ended = false;
  while (at < bytes.length) {
    const tag = bytes[at];
    if (tag === 0x3b) { ended = true; break; }
    if (tag === 0x21) {
      const label = bytes[at + 1];
      if (label === 0xf9) {
        if (bytes[at + 2] !== 4 || bytes[at + 7] !== 0) throw new Error("Malformed GIF graphics control");
        delays.push({ offset: at + 4, cs: bytes.readUInt16LE(at + 4) });
        at += 8;
      } else {
        at = readSubBlocks(at + 2);
      }
    } else if (tag === 0x2c) {
      if (at + 10 > bytes.length) throw new Error("Truncated GIF image descriptor");
      at += 10 + colorTableSize(bytes[at + 9]);
      at = readSubBlocks(at + 1); // LZW minimum code size byte then image sub-blocks.
      images += 1;
    } else throw new Error(`Unexpected GIF block 0x${tag.toString(16)} at ${at}`);
  }
  if (!ended || !images || !delays.length || delays.length !== images) {
    throw new Error("GIF must have a graphics-control delay for every image frame");
  }
  return { delays, images, centiseconds: delays.reduce((sum, item) => sum + item.cs, 0) };
}

export function retimeGif(bytes, targetSeconds = 22) {
  const stats = gifDelays(bytes);
  const target = Math.round(targetSeconds * 100);
  if (target < stats.images * 2) throw new Error("Target too short for reliable browser GIF timing");
  if (Math.abs(target - stats.centiseconds) <= 1) {
    return { bytes, before: stats, after: stats, changed: false };
  }
  if (!stats.centiseconds) throw new Error("GIF has no playback duration");
  const result = Buffer.from(bytes);
  let accumulated = 0;
  let assigned = 0;
  for (let index = 0; index < stats.delays.length; index += 1) {
    accumulated += stats.delays[index].cs;
    // Distribute rounding error across frames, preserving every original image.
    const expected = Math.round(accumulated * target / stats.centiseconds);
    const remaining = stats.delays.length - index - 1;
    const delay = Math.max(2, Math.min(target - assigned - remaining * 2, expected - assigned));
    if (delay > 65535) throw new Error("GIF frame delay exceeds file format maximum");
    result.writeUInt16LE(delay, stats.delays[index].offset);
    assigned += delay;
  }
  if (assigned !== target) throw new Error(`Retime missed target: ${assigned} vs ${target}`);
  const after = gifDelays(result);
  if (after.images !== stats.images || result.length !== bytes.length) throw new Error("GIF frame structure changed");
  return { bytes: result, before: stats, after, changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const filename = path.resolve(process.argv[2] || "docs/demo.gif");
  const seconds = Number(process.argv[3] || 22);
  if (!Number.isFinite(seconds)) throw new Error("Invalid target seconds");
  const result = retimeGif(fs.readFileSync(filename), seconds);
  if (result.changed) fs.writeFileSync(filename, result.bytes);
  console.log(`README GIF: ${result.before.images} frames retained; ${(result.before.centiseconds / 100).toFixed(2)}s → ${(result.after.centiseconds / 100).toFixed(2)}s; pixels unchanged`);
}
