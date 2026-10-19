/**
 * Shared pickup RSVP capacity policy (v11.2.4).
 * The 16-slot fallback is for notification thresholds only. The public
 * capacity is the actual positive upstream cap, never an invented limit.
 * Older snapshots cannot distinguish a genuine 16 from the former fallback,
 * so avoid advertising a 16-slot limit until a fresh source read confirms it.
 */
export const DEFAULT_PICKUP_CAPACITY = 16;

export function sourcePickupCapacity(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function effectivePickupCapacity(value) {
  return sourcePickupCapacity(value) ?? DEFAULT_PICKUP_CAPACITY;
}

export function visiblePickupCapacity(event) {
  if (Object.prototype.hasOwnProperty.call(event ?? {}, "publishedCapacity")) {
    return sourcePickupCapacity(event.publishedCapacity);
  }
  const legacyCapacity = sourcePickupCapacity(event?.capacity);
  return legacyCapacity === DEFAULT_PICKUP_CAPACITY ? null : legacyCapacity;
}
