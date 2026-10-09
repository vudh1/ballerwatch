/**
 * BallerWatch 8.1: privacy gate for optional third-party AI intent routing.
 * A model may only classify low-risk, short, public-schedule questions. It
 * never receives private account context, RSVP identities, or answer facts.
 * All returned intent/date fields must still be validated by the Worker.
 */
export function safeForExternalIntent(question) {
  const text = String(question || "").trim();
  if (!text || text.length > 180) return false;
  if (/@|https?:|www\.|[<>[\]{}\\]|(?:\+?\d[\d\s().-]{8,}\d)/i.test(text)) return false;
  if (/\b(?:i|me|my|mine|our|ours|we|us|password|passcode|pin|otp|token|secret|email|phone|account|login|sign.?in|username|private|personal|roster|waitlist|rsvp|register(?:ed)?|confirmed|contact|address|birthday|dob|location of me)\b/i.test(text)) return false;
  if (!/^[\p{L}\p{N}\s!?.,:'"/()&-]+$/u.test(text)) return false;
  return /\b(?:soccer|football|league|team|teams|game|games|match|matches|fixture|fixtures|schedule|playing|opponent|field|venue|jersey|kickoff|history|record|season|today|tomorrow|week|when|where|who)\b/i.test(text);
}

export function validatedAiIntent(classification, validDates) {
  const allowed = new Set([
    "pickup_status", "today_games", "date_games", "range_games", "next_game",
    "league_teams", "rats_history", "version",
  ]);
  if (!classification || !allowed.has(classification.intent)) return null;
  const date = typeof classification.date === "string" ? classification.date.trim() : "";
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Array.isArray(validDates) || !validDates.includes(date))) return null;
  return { intent: classification.intent, date };
}
