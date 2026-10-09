/**
 * Classifies newly filled RSVP spots into capacity-based public alerts.
 * A positive reservation-count transition is required: never alert from an
 * initial observation, cancellation, or capacity-setting change.
 */
export function pickupCapacityAlert(previous, current) {
  const before = Number(previous?.reserved);
  const reserved = Number(current?.reserved);
  const capacity = Number(current?.capacity);
  if (
    previous?.reserved == null || current?.reserved == null ||
    previous?.capacity == null || current?.capacity == null ||
    !Number.isSafeInteger(before) || !Number.isSafeInteger(reserved) ||
    !Number.isSafeInteger(capacity) || capacity <= 0 ||
    Number(previous.capacity) !== capacity ||
    before < 0 || reserved <= before
  ) return null;

  const quarter = Math.ceil(capacity * 0.25);
  const half = Math.ceil(capacity * 0.5);
  const threeQuarter = Math.ceil(capacity * 0.75);
  let kind = "";
  if (reserved >= capacity && before < capacity && before >= threeQuarter) {
    kind = "full";
  } else if (reserved >= threeQuarter) {
    // From 75% onward, every newly observed filled spot generates an alert.
    kind = before < threeQuarter ? "75%" : reserved >= capacity ? "full" : "spot";
  } else if (before < half && reserved >= half) {
    kind = "50%";
  } else if (before < quarter && reserved >= quarter) {
    kind = "25%";
  }
  if (!kind) return null;
  return {
    kind, reserved, capacity,
    remaining: Math.max(0, capacity - reserved),
    occupancyPercent: Math.round(reserved * 100 / capacity),
  };
}
