/**
 * Privacy-safe deterministic engineering summaries for wrong-answer feedback.
 *
 * This module maps private question text to a fixed set of engineering facets.
 * It never copies user text, names, dates, addresses, or identifiers into the
 * review projection.
 */

function clean(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function historyIntentLabel(intent) {
  const value = String(intent || "").trim().slice(0, 60);
  const labels = {
    pickup_status: "pickup date/status",
    date_games: "single-date schedule",
    range_games: "schedule range",
    next_game: "next-game",
    today_games: "today schedule",
    league_teams: "league-team",
    rats_history: "RATS-history",
    feature_request: "feature-request",
  };
  return labels[value] || "web Q&A";
}

export function feedbackQuestionShape(question) {
  const lower = clean(question);
  const facets = [];
  const add = (value) => {
    if (!facets.includes(value)) facets.push(value);
  };

  if (/\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{1,2}\/\d{1,2}|20\d{2}-\d{1,2}-\d{1,2})\b/.test(lower)) {
    add("dated");
  }
  if (/\b(?:this|next|coming)\s+week\b|\bnext\s+(?:\d+|two)\s+weeks?\b/.test(lower)) {
    add("schedule range");
  }
  if (/\bnext\b/.test(lower) && /\b(?:game|match)\b/.test(lower)) add("next game");
  if (/\b(?:pickup|rsvp|reserved|spots?|capacity|availability|full|waitlist|registered|signed\s*up)\b/.test(lower)) {
    add("pickup/RSVP");
  }
  if (/\b(?:jersey|kit|uniform|color|colour|wear)\b/.test(lower)) add("jersey");
  if (/\b(?:who|opponent|versus|vs\.?|playing against|play against)\b/.test(lower)) add("opponent");
  if (/\b(?:time|when|start|kickoff|kick off)\b/.test(lower)) add("time");
  if (/\b(?:where|field|location|address|venue)\b/.test(lower)) add("venue");
  if (/\b(?:weather|rain|temperature|forecast)\b/.test(lower)) add("weather");
  if (/\b(?:record|wins?|losses?|draws?|all[- ]time|historical|history)\b/.test(lower)) {
    add("historical record");
  }
  if (/\b(?:head[ -]?to[ -]?head|h2h|previous meetings?|played before|met before)\b/.test(lower)) {
    add("head-to-head");
  }
  if (/\b(?:winter|spring|summer|fall)\s+20\d{2}\b/.test(lower)) {
    add("historical season");
  }

  return facets.slice(0, 4).join(" + ") || "general question";
}

export function negativeFeedbackProjection(event = {}) {
  return {
    kind: "negative_feedback",
    summary:
      `A ${historyIntentLabel(event.intent)} answer about ${feedbackQuestionShape(event.question)} was explicitly marked wrong.`,
    reason: String(event?.intent || "") === "rats_history"
      ? "Check RATS archive coverage, score parsing, season discovery, and team matching; no user text is copied into the review projection."
      : "Deterministic privacy-safe feedback fingerprint; no user text is copied into the review projection.",
  };
}
