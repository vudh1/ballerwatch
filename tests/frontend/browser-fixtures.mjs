/**
 * Synthetic public/private API contracts for notification-silent browser tests.
 * Baseline: v8.12.2. No real users, runtime documents, push or Calendar writes.
 */
export const fixtureGame = {
  id: "pickup:2099-10-15", kind: "pickup", date: "2099-10-15",
  dateLabel: "Thursday, October 15", title: "Pickup soccer", time: "8–10 PM",
  location: "Fixture Park Soccer", mapsQuery: "Fixture Park Soccer",
  reserved: 12, capacity: 16, publishedCapacity: 16, sourceUpdatedAt: "2099-10-14T20:00:00Z",
  rsvpUrl: "https://nhcuong95.github.io/rsvp/index.html",
  weather: { rainProbability: 20, weatherCode: 2, temperature: 14 },
};
export const fixtureCalendar = {
  startDate: "2099-10-14", updatedAt: "2099-10-14T20:00:00Z", games: [fixtureGame, {
    id: "league:2099-10-18", kind: "league", date: "2099-10-18",
    dateLabel: "Sunday, October 18", title: "Fixture FC vs Test United",
    team: "Fixture FC", opponent: "Test United", jerseyColor: "White",
    time: "10 AM–12 PM", location: "Fixture League Field", mapsQuery: "Fixture League Field",
  }, {
    id: "league:2099-10-18-later", kind: "league", date: "2099-10-18",
    dateLabel: "Sunday, October 18", title: "Fixture FC vs Second FC",
    team: "Fixture FC", opponent: "Second FC", jerseyColor: "Green",
    time: "12 PM–2 PM", location: "Fixture League Field", mapsQuery: "Fixture League Field",
  }],
};
export const fixtureStandings = {
  season: "Fixture Fall", updatedAt: "2099-10-14T20:00:00Z", cards: [{
    team: "Fixture FC", division: "D2", divisionKey: "D2", ready: true, hasResults: true,
    rows: [
      { name: "Fixture FC", rank: 1, highlighted: true, played: 3, wins: 2, draws: 1, losses: 0, goalDifference: 4, points: 7 },
      { name: "Test United", rank: 2, played: 3, wins: 1, draws: 1, losses: 1, goalDifference: 0, points: 4 },
    ],
  }],
  matchups: {
    fixtureVsTest: {
      team: "Fixture FC", opponent: "Test United",
      winPct: 45, drawPct: 20, lossPct: 35,
      teamGames: 10, opponentGames: 8, headToHeadGames: 2,
    },
  },
};

export function fixtureResponse(pathname, method = "GET") {
  if (method === "POST" && pathname === "/web/admin/unlock") {
    return { ok: true, token: "synthetic-browser-session", username: "admin" };
  }
  if (method !== "GET") throw new Error(`Unexpected synthetic mutation: ${method} ${pathname}`);
  const responses = {
    "/web/config": { ok: true, version: "11.0.0", push: { ready: false } },
    "/web/calendar": { ok: true, calendar: fixtureCalendar },
    "/web/next-game": { ok: true, game: fixtureGame },
    "/web/standings": { ok: true, standings: fixtureStandings },
    "/web/board": { ok: true, entries: [{ id: "fixture-notice", title: "Fixture match update", body: "Synthetic browser test only.", channel: "pickup", at: "2099-10-14T20:00:00Z" }] },
    "/web/user/rsvp-status": { ok: true, rsvp: { confirmedDates: [], waitlistedDates: [] } },
    "/web/user/notifications": { ok: true, profile: { readIds: [], deletedIds: [], channels: { pickup: true, league: true, version: true } } },
    "/web/user/settings": { ok: true, settings: { username: "admin", canManageMatches: true, canManageUsers:false, passwordConfigured:true, deletedMatches:[], teams:["Fixture FC"] } },
    "/web/rsvp-roster": { ok: true, roster: { players: [{ name: "Fixture Player", participantCount: 1 }], waitlist: [] } },
    "/web/teams": { ok: true, teams: ["Fixture FC", "Test United"] },
    "/web/sports": {
      ok: true, updatedAt: "2099-10-14T20:00:00Z",
      provider: "synthetic test only",
      teams: ["NBA · Fixture Lakers", "NBA · Fixture Celtics"],
      games: [],
    },
  };
  return responses[pathname] || { ok: true, reports: [], choices: { rsvpNames: ["Fixture Player"], teams: ["Fixture FC"] } };
}
