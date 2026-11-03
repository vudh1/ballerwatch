import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_RATS_REGISTRY,
  PUBLIC_TEAM_EXPORT_HEADERS,
  aggregatePublicRatsTables,
  parsePublicGviz,
  parsePublicSeasonRegistry,
  publicTeamSchedule,
  publishedRatsCall,
} from "../../../backend/league/rats-public-source.mjs";

const SHEET_ID = "testPublicSheetId_abcdefghijklmnop12345678";
const REGISTRY = "{ key: 'fall-2026', title: 'Fall 2026', sheetId: '" +
  SHEET_ID + "' }, { key: 'summer-2026', title: 'Summer 2026', sheetId: '" +
  SHEET_ID + "', frozen: true }";

function syntheticTables() {
  return {
    games: {
      headers: ["Home", "Away", "Date", "Time", "Location",
        "Home Color", "Away Color", "Notes TC", "Home Score", "Away Score"],
      rows: [
        ["Team Alpha", "Team Beta", "2026-11-01", "20:00:00",
          "Park 1", "White", "White", "", 2, 0],
        ["Team Alpha", "Team Beta", "2026-11-08", "20:00:00",
          "Park 1", "White", "Blue", "", "", ""],
        ["Team Alpha", "Team Beta", "2026-11-08", "20:00:00",
          "Park 1", "White", "Blue", "", "", ""],
        ["Team Alpha", "Team Beta", "2026-11-15", "20:00:00",
          "Park 1", "", "", "", 4, 1],
      ],
    },
    teams: {
      headers: ["Team", "Color", "2nd Color", "Gender", "Division",
        "Day", "Dropdown Name"],
      rows: [
        ["Team Alpha", "White", "Black", "Coed", "2", "Sunday", "Team Alpha"],
        ["Team Beta", "Blue", "Yellow", "Coed", "3", "Sunday", "Team Beta"],
        ["TBD", "", "", "", "", "", ""],
      ],
    },
    venues: {
      headers: ["PARKS", "Team Cowboy as of 4/2015"],
      rows: [["Park 1", "Published Stadium"]],
    },
  };
}

function wrapped(table) {
  const cols = table.headers.map((label) => ({
    label, type: label === "Date" ? "date" : label === "Time" ? "datetime" :
      typeof table.rows[0]?.[table.headers.indexOf(label)] === "number" ? "number" : "string",
  }));
  return "/*O_o*/\ngoogle.visualization.Query.setResponse(" +
    JSON.stringify({ status: "ok", table: { cols, rows: table.rows.map((row) => ({
      c: row.map((v) => v === "" ? null : { v }),
    })) } }) + ");";
}

test("public registry is parsed without evaluating external JavaScript", () => {
  const seasons = parsePublicSeasonRegistry("export const SEASONS = [" + REGISTRY + "];");
  assert.equal(seasons.get("fall-2026").sheetId, SHEET_ID);
  assert.equal(seasons.get("fall-2026").frozen, false);
  assert.equal(seasons.get("summer-2026").frozen, true);
  assert.throws(() => parsePublicSeasonRegistry("const SEASONS = []"), /No published/);
  assert.throws(() => parsePublicSeasonRegistry(REGISTRY + "," + REGISTRY), /Duplicate/);
});

test("RATS Google Visualization parser handles date/time/zero and rejects script payloads", () => {
  const sample = {
    headers: ["Date", "Time", "Home Score", "Away Score"],
    rows: [["Date(2026,10,1)", "Date(1899,11,30,20,30,0)", 0, 2]],
  };
  const raw = wrapped(sample).replace('"type":"string"', '"type":"date"');
  const normalized = parsePublicGviz(raw);
  assert.deepEqual(normalized.rows[0].slice(0,2), ["2026-11-01", "20:30:00"]);
  assert.equal(normalized.rows[0][2], 0);
  assert.throws(() => parsePublicGviz("alert(1);"), /Unrecognized/);
  assert.throws(() => parsePublicGviz(
    "google.visualization.Query.setResponse({\"status\":\"error\"});"), /Invalid/);
});

test("official RATS sheet columns produce scored games, team exports and division metadata", () => {
  const aggregate = aggregatePublicRatsTables(syntheticTables());
  assert.equal(aggregate.teams.length, 2);
  assert.equal(aggregate.events.length, 2, "exclude uncolored partials and duplicates");
  assert.equal(aggregate.events[0].score, "2-0");
  assert.equal(aggregate.events[1].score, null);
  assert.equal(aggregate.events[0].location, "Published Stadium");
  assert.equal(aggregate.events[0].home_color, "Black");
  assert.equal(aggregate.teams[1].division, "3");
  const schedule = publicTeamSchedule(aggregate, aggregate.teams[0].schedule_key);
  assert.deepEqual(schedule[0], PUBLIC_TEAM_EXPORT_HEADERS);
  assert.equal(schedule.length, 3);
  assert.equal(schedule[1][6], "Home");
  assert.equal(schedule[1][7], "Team Beta");
  assert.equal(schedule[1][9], "Black");
  assert.equal(schedule[1][8], "Published Stadium");
  assert.throws(() => publicTeamSchedule(aggregate, "other:team"), /Unknown/);
});

test("public sheets are fetched once per source window and never via retired host", async () => {
  const tables = syntheticTables();
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (url === PUBLIC_RATS_REGISTRY) return {ok: true, text: async () => REGISTRY};
    const tab = new URL(url).searchParams.get("sheet");
    const value = tab === "Field List" ? tables.games :
      tab === "Team Name, Color, and Division" ? tables.teams : tables.venues;
    return {ok: true, text: async () => wrapped(value)};
  };
  const aggregate = await publishedRatsCall("get-aggregate",
    { season: "fall-2026" }, { fetchImpl });
  assert.equal(aggregate.events[0].score, "2-0");
  const exportRows = await publishedRatsCall("get-schedule",
    { season: "fall-2026", key: aggregate.teams[1].schedule_key }, { fetchImpl });
  assert.equal(exportRows[1][6], "Away");
  assert.equal(requests.length, 4, "one public registry and three public sheet tabs");
  assert.ok(requests.every((url) =>
    url.startsWith("https://rats.team.op-dev.io/") ||
    url.startsWith("https://docs.google.com/spreadsheets/d/")));
  const missing = await publishedRatsCall("get-aggregate",
    { season: "winter-2027" }, { fetchImpl });
  assert.deepEqual(missing, { teams: [], events: [] });
  assert.equal(requests.length, 4);
});

test("frozen archives are fetched only from the official published site", async () => {
  const tables = syntheticTables();
  const snapshot = aggregatePublicRatsTables(tables);
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return { ok: true, text: async () => url === PUBLIC_RATS_REGISTRY
      ? REGISTRY : JSON.stringify(snapshot) };
  };
  const archive = await publishedRatsCall("get-aggregate",
    { season: "summer-2026" }, { fetchImpl });
  assert.equal(archive.teams.length, 2);
  assert.ok(archive.teams[0].schedule_key.startsWith("public:"));
  assert.deepEqual(urls, [PUBLIC_RATS_REGISTRY,
    "https://rats.team.op-dev.io/data/summer-2026.json"]);
});

test("schema changes, private sheets and empty results never replace last-good data", async () => {
  const tables = syntheticTables();
  delete tables.games.headers[8];
  assert.throws(() => aggregatePublicRatsTables(tables), /headers changed/);
  const blocked = async (url) => url === PUBLIC_RATS_REGISTRY
    ? {ok: true, text: async () => REGISTRY}
    : {ok: false, status: 403};
  await assert.rejects(
    publishedRatsCall("get-aggregate", { season: "fall-2026" }, { fetchImpl: blocked }),
    /HTTP 403/,
  );
  await assert.rejects(
    publishedRatsCall("get-aggregate", { season: "winter-2026/../../" }),
    /Invalid RATS season/,
  );
});
