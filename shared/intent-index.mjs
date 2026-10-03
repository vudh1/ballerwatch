/**
 * Shared deterministic intent index for fast natural-language routing before Groq.
 *
 * Documentation baseline: v2.5.2. Common schedule/date phrasing from privacy-minimized chat review is routed deterministically before AI. This module contains no user data and is safe to bundle at the edge.
 */

const INTENT_INDEX = Object.freeze([
  {
    intent: "version",
    phrases: ["version", "release", "what version", "current version", "latest version"],
    tags: ["version", "release", "build"],
  },
  {
    intent: "today_games",
    phrases: [
      "games today",
      "game today",
      "today games",
      "playing today",
      "soccer today",
      "today schedule",
      "schedule today",
      "today's schedule",
    ],
    tags: ["today", "game", "games", "match", "soccer", "schedule"],
  },
  {
    intent: "next_game",
    phrases: [
      "next game",
      "next match",
      "when next game",
      "upcoming game",
      "upcoming match",
      "recommend a game",
      "suggest a game",
      "which game should i play",
    ],
    tags: ["next", "upcoming", "game", "match", "when", "recommend", "suggest"],
  },
  {
    intent: "range_games",
    phrases: [
      "games next week",
      "next week's games",
      "next week games",
      "schedule next week",
      "next week schedule",
      "games this week",
      "this week's games",
      "this week games",
      "schedule this week",
      "this week schedule",
      "next 2 weeks",
      "next two weeks",
    ],
    tags: ["week", "weeks", "schedule", "game", "games", "match", "matches"],
  },
  {
    intent: "pickup_status",
    phrases: [
      "how many",
      "rsvp count",
      "reserved count",
      "spots left",
      "pickup status",
      "pickup game",
      "pickup details",
      "what field",
      "what time",
    ],
    tags: ["count", "many", "spots", "rsvp", "reserved", "capacity", "availability", "pickup", "details", "field", "where", "time", "when"],
  },
  {
    intent: "date_games",
    phrases: [
      "game on",
      "games on",
      "games are on",
      "what games are on",
      "match on",
      "matches on",
      "schedule for",
      "schedule on",
      "game schedule",
      "soccer schedule",
    ],
    tags: ["schedule", "game", "games", "match", "matches", "playing", "soccer"],
  },
  {
    intent: "league_teams",
    phrases: ["league teams", "teams monitored", "which teams", "what teams"],
    tags: ["league", "team", "teams", "monitor", "monitored"],
  },
  {
    intent: "help",
    phrases: ["help", "what can you do", "commands", "how to use"],
    tags: ["help", "commands", "use"],
  },
]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9:/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

export function classifyIndexedIntent(text) {
  const normalized = normalize(text);
  if (!normalized) return null;

  let best = null;
  for (const item of INTENT_INDEX) {
    let score = 0;
    for (const phrase of item.phrases) {
      if (normalized === phrase) score += 8;
      else if (normalized.includes(phrase)) score += 5;
    }

    const inputTokens = tokens(normalized);
    for (const tag of item.tags) {
      if (inputTokens.has(tag)) score += 1;
    }

    if (!best || score > best.score) best = { intent: item.intent, score };
  }

  return best && best.score >= 2 ? best.intent : null;
}

export function intentIndexSummary() {
  return INTENT_INDEX.map(({ intent, tags }) => ({ intent, tags: [...tags] }));
}
