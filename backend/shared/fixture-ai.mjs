/**
 * BallerWatch AI 8: grounded, zero-inference fixture reasoning for monitored
 * RATS teams. Only validated schedule fields are used in answers; neither
 * public provider models nor free-text memory receive user-specific data.
 * Context references are accepted only after resolving a current fixture.
 */
function normalize(value) {
  return String(value || "").toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function aliases(value) {
  const cleaned = normalize(value);
  if (!cleaned) return [];
  const stripped = cleaned.replace(/(?: (?:football|soccer) club| fc| sc)+$/g, "").trim();
  return [...new Set([cleaned, stripped].filter(Boolean))];
}

function foundInQuestion(question, name) {
  const words = ` ${normalize(question)} `;
  return aliases(name).some(alias => alias.length >= 4 && words.includes(` ${alias} `));
}

function clock(value) {
  const raw = String(value || "").trim();
  const iso = Date.parse(raw);
  if (/^\d{4}-\d\d-\d\dT/.test(raw) && Number.isFinite(iso)) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
  }
  return raw.slice(0, 40);
}

function safeFixtures(games = []) {
  const seen = new Set();
  return (Array.isArray(games) ? games : []).flatMap(game => {
    if (!game || !/^20\d{2}-\d{2}-\d{2}$/.test(String(game.date || ""))) return [];
    const team = String(game.team || "").trim();
    const opponent = String(game.opponent || "").trim();
    if (!team || !opponent) return [];
    const key = String(game.key || "").slice(0, 120) ||
      [game.date,team,opponent,game.startTime].join("|");
    // Monitor coverage may include both teams in the same fixture.
    const identity = [
      game.date, normalize(team), normalize(opponent), String(game.startTime || ""),
    ].join("|");
    const reverse = [
      game.date, normalize(opponent), normalize(team), String(game.startTime || ""),
    ].join("|");
    if (seen.has(identity) || seen.has(reverse)) return [];
    seen.add(identity);
    return [{
      key, date:game.date, team, opponent,
      time: clock(game.start || game.startTime),
      location: String(game.location || "").trim().slice(0, 160),
      jersey: String(game.jerseyColor || "").trim().slice(0, 80),
      score: game.teamScore == null || game.opponentScore == null ? "" :
        `${game.teamScore}–${game.opponentScore}`,
    }];
  }).sort((a,b) => a.date.localeCompare(b.date) ||
    a.time.localeCompare(b.time) || a.team.localeCompare(b.team));
}

function fixtureDetail(game, focus) {
  const heading = `${game.date} · ${game.team} vs ${game.opponent}`;
  const rows = [heading];
  if (focus === "where") {
    rows.push(game.location ? `📍 ${game.location}` : "Venue not yet published.");
  } else if (focus === "time") {
    rows.push(game.time ? `🕒 ${game.time} (Pacific)` : "Kickoff time not yet published.");
  } else if (focus === "jersey") {
    rows.push(game.jersey ? `👕 ${game.team}: ${game.jersey} jersey` :
      "Jersey color not yet published.");
  } else {
    rows.push(game.time ? `🕒 ${game.time} (Pacific)` : "Kickoff time pending.");
    rows.push(game.location ? `📍 ${game.location}` : "Venue pending.");
    if (game.jersey) rows.push(`👕 ${game.jersey} jersey`);
    if (game.score) rows.push(`Score: ${game.score}`);
  }
  return rows.join("\n");
}

const HISTORY_WORDS = /\b(?:record|historical|history|head.to.head|h2h|played before|met before|previous meetings|beat|beaten|lost to|won against)\b/i;
const GAME_WORDS = /\b(?:game|games|match|matches|fixture|fixtures|play|playing|plays|face|faces|against|vs|versus|opponent|next|upcoming|where|when|time|kickoff|jersey|wear|field|venue|schedule)\b/i;
const FOLLOWUP = /^(?:and )?(?:where(?: is| was)?(?: it| that| the (?:game|match))?|what (?:time|field|venue|jersey|color|colour)|when(?: is| was)?(?: it| that)?|what about (?:that|it)|tell me more|and (?:the )?(?:time|field|venue|jersey)|which field)\??$/i;

export function answerFixtureQuestion(question, rawGames = [], context = {}, today = "") {
  const text = String(question || "").trim().slice(0, 600);
  if (!text || HISTORY_WORDS.test(text)) return null;
  const fixtures = safeFixtures(rawGames);
  if (!fixtures.length) return null;

  const matched = fixtures.filter(game =>
    foundInQuestion(text, game.team) || foundInQuestion(text, game.opponent));
  const namedTeams = [...new Set(fixtures.flatMap(game => [game.team, game.opponent])
    .filter(name => foundInQuestion(text, name)).map(normalize))];
  const reference = String(context.lastMatchKey || "").slice(0, 120);
  const followup = FOLLOWUP.test(text);
  const explicitDate = text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || "";
  // A follow-up must refer to an observed fixture, never an arbitrary key.
  const remembered = followup && !namedTeams.length && !explicitDate
    ? fixtures.filter(game => game.key === reference) : [];
  if (!namedTeams.length && !remembered.length) return null;
  if (!GAME_WORDS.test(text) && !followup) return null;

  const candidates = (remembered.length ? remembered : matched)
    .filter(game => explicitDate ? game.date === explicitDate : !today || game.date >= today);
  const focus = /\b(?:where|location|venue|field)\b/i.test(text) ? "where" :
    /\b(?:jersey|kit|uniform|color|colour|wear)\b/i.test(text) ? "jersey" :
    /\b(?:time|when|kickoff)\b/i.test(text) ? "time" : "summary";

  if (!candidates.length) return {
    reply: `No ${explicitDate ? "matching" : "upcoming"} RATS fixture is published for that team or matchup in the monitored schedule. I can't confirm an unpublished match.`,
    intent:"league_fixture", lastMatchKey:"", lastDate:"",
  };

  const limited = candidates.slice(0, 5);
  const reply = [
    candidates.length === 1 ? "RATS fixture:" :
      `Found ${candidates.length} matching RATS fixtures (showing ${limited.length}):`,
    ...limited.map(game => fixtureDetail(game, focus)),
    "Source: RATS monitored schedule · Times in Pacific · Unpublished details stay pending.",
  ].join("\n\n");
  return {
    reply, intent:"league_fixture",
    lastDate:limited.length === 1 ? limited[0].date : "",
    lastMatchKey:limited.length === 1 ? limited[0].key : "",
  };
}
