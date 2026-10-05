/**
 * Shared deterministic intent index for fast, zero-AI natural-language routing.
 * Contains no user data and is safe to bundle at the edge.
 */

const INTENT_INDEX = Object.freeze([
  {
    intent: "version",
    phrases: ["version", "release", "what version", "current version", "latest version", "what build"],
    tags: ["version", "release", "build"],
  },
  {
    intent: "today_games",
    phrases: [
      "games today", "game today", "today games", "playing today", "soccer today",
      "today schedule", "schedule today", "today's schedule", "do i play today",
      "am i playing today", "anything today",
    ],
    tags: ["today", "game", "games", "match", "soccer", "schedule", "playing"],
  },
  {
    intent: "next_game",
    phrases: [
      "next game", "next match", "when next game", "upcoming game", "upcoming match",
      "recommend a game", "suggest a game", "which game should i play", "who do we play next",
      "who are we playing next", "where is my next game", "what time is my next game",
      "next game jersey", "what color is my next jersey",
    ],
    tags: ["next", "upcoming", "game", "match", "when", "recommend", "suggest", "opponent", "jersey"],
  },
  {
    intent: "range_games",
    phrases: [
      "games next week", "next week's games", "next week games", "schedule next week",
      "next week schedule", "games this week", "this week's games", "this week games",
      "schedule this week", "this week schedule", "next 2 weeks", "next two weeks",
      "what do i have this week", "what do i have next week",
    ],
    tags: ["week", "weeks", "schedule", "game", "games", "match", "matches"],
  },
  {
    intent: "pickup_status",
    phrases: [
      "how many", "rsvp count", "reserved count", "spots left", "pickup status",
      "pickup game", "pickup details", "what field", "what time", "is pickup full",
      "am i in", "am i signed up", "am i registered", "waitlist position",
    ],
    tags: [
      "count", "many", "spots", "rsvp", "reserved", "capacity", "availability",
      "pickup", "details", "field", "where", "time", "when", "full", "waitlist",
      "registered", "signed",
    ],
  },
  {
    intent: "date_games",
    phrases: [
      "game on", "games on", "games are on", "what games are on", "match on",
      "matches on", "schedule for", "schedule on", "game schedule", "soccer schedule",
      "who do we play", "who are we playing", "what jersey", "jersey color",
      "what color do i wear", "where is the game", "what time is the game",
      "do i have a game", "am i playing",
    ],
    tags: [
      "schedule", "game", "games", "match", "matches", "playing", "soccer",
      "jersey", "color", "colour", "wear", "opponent",
    ],
  },
  {
    intent: "league_teams",
    phrases: ["league teams", "teams monitored", "which teams", "what teams", "teams are you watching"],
    tags: ["league", "team", "teams", "monitor", "monitored", "watching"],
  },
  {
    intent: "help",
    phrases: ["help", "what can you do", "commands", "how to use", "what can i ask"],
    tags: ["help", "commands", "use", "ask"],
  },
]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9:/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistanceAtMostOne(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function tokenMatches(input, expected) {
  if (input === expected || input.startsWith(expected) || expected.startsWith(input)) return true;
  return input.length >= 4 && expected.length >= 4 && editDistanceAtMostOne(input, expected);
}

export function classifyIndexedIntent(text) {
  const normalized = normalize(text);
  if (!normalized) return null;
  const inputTokens = normalized.split(" ").filter(Boolean);

  let best = null;
  for (const item of INTENT_INDEX) {
    let score = 0;
    for (const phrase of item.phrases) {
      if (normalized === phrase) score += 8;
      else if (normalized.includes(phrase)) score += 5;
    }
    for (const tag of item.tags) {
      if (inputTokens.some((token) => tokenMatches(token, tag))) score += 1;
    }
    if (!best || score > best.score) best = { intent: item.intent, score };
  }
  return best && best.score >= 2 ? best.intent : null;
}

export function intentIndexSummary() {
  return INTENT_INDEX.map(({ intent, tags }) => ({ intent, tags: [...tags] }));
}
