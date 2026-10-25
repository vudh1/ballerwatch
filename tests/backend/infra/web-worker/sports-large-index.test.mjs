import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("encrypted professional catalogue uses raw GitHub responses above 1MB", () => {
  const source = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  const start = source.indexOf("async function loadSportsIndex(");
  const end = source.indexOf("function webTeamSelection(", start);
  assert.ok(start > 0 && end > start, "Sports index loader must exist");
  const loader = source.slice(start, end);
  assert.match(loader, /await githubRawJsonFile\(env, "sports\/state\/fixtures\.json", "runtime-state"\)/);
  assert.doesNotMatch(loader, /await githubFile\(/);
  assert.match(source, /async function githubRawJsonFile\(/);
  assert.match(source, /application\/vnd\.github\.raw\+json/);
});
