/**
 * Shared effective capacity for published RSVP pickup dates (v11.2.3).
 * A missing, unset or non-positive source cap uses 16 only for BallerWatch's
 * display and capacity alerts; it does not modify the upstream RSVP service.
 * Do not apply this fallback to synthetic free pickup or league matches.
 */
export const DEFAULT_PICKUP_CAPACITY = 16;

export function effectivePickupCapacity(value) {
  if (value == null || String(value).trim() === "") return DEFAULT_PICKUP_CAPACITY;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PICKUP_CAPACITY;
}
