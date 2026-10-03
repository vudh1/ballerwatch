/**
 * Privacy-safe feature-request classification and public aggregate projection.
 *
 * This module is runtime-agnostic so both Node workflows and the Cloudflare
 * Worker use the same allowlisted categories without importing filesystem APIs.
 */

export const REQUEST_CATEGORIES = Object.freeze([
  "schedule",
  "rsvp",
  "notifications",
  "league",
  "setup",
  "other",
]);

export function requestCategory(question) {
  const text = String(question || "").toLowerCase();
  if (/\b(schedule|game|match|when|today|tomorrow|week)\b/.test(text)) return "schedule";
  if (/\b(rsvp|waitlist|reserved|capacity|count|players|availability)\b/.test(text)) return "rsvp";
  if (/\b(notify|notification|notifications|mute|snooze|alert)\b/.test(text)) return "notifications";
  if (/\b(league|team|teams|score)\b/.test(text)) return "league";
  if (/\b(setup|configure|endpoint|user|settings|password)\b/.test(text)) return "setup";
  return "other";
}

export function publicRequestSummary(requests) {
  const list = Array.isArray(requests) ? requests : [];
  const counts = new Map(REQUEST_CATEGORIES.map((category) => [category, 0]));
  const feedback = new Map(
    REQUEST_CATEGORIES.map((category) => [category, { manual: 0, thumbsDown: 0 }]),
  );

  for (const request of list) {
    const category = requestCategory(request?.question);
    const count = Number.isSafeInteger(request?.count) && request.count > 0
      ? request.count
      : 1;
    counts.set(
      category,
      Math.min(Number.MAX_SAFE_INTEGER, counts.get(category) + count),
    );

    const source = String(request?.source || "");
    if (source === "manual") feedback.get(category).manual += 1;
    if (source === "thumbs_down") feedback.get(category).thumbsDown += 1;
  }

  return {
    version: 3,
    requests: REQUEST_CATEGORIES
      .filter((category) => counts.get(category) > 0)
      .map((category) => ({
        category,
        count: counts.get(category),
        manual: feedback.get(category).manual,
        thumbsDown: feedback.get(category).thumbsDown,
      })),
  };
}

export function isPublicRequestSummary(value) {
  const exact = (obj, keys) =>
    obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    Object.keys(obj).length === keys.length &&
    keys.every((key) => Object.hasOwn(obj, key));

  if (
    !exact(value, ["version", "requests"]) ||
    value.version !== 3 ||
    !Array.isArray(value.requests)
  ) {
    return false;
  }

  const seen = new Set();
  return value.requests.every((request) => {
    if (
      !exact(request, ["category", "count", "manual", "thumbsDown"]) ||
      !REQUEST_CATEGORIES.includes(request.category) ||
      !Number.isSafeInteger(request.count) ||
      request.count < 1 ||
      !Number.isSafeInteger(request.manual) ||
      request.manual < 0 ||
      !Number.isSafeInteger(request.thumbsDown) ||
      request.thumbsDown < 0 ||
      request.manual + request.thumbsDown > request.count ||
      seen.has(request.category)
    ) {
      return false;
    }
    seen.add(request.category);
    return true;
  });
}
