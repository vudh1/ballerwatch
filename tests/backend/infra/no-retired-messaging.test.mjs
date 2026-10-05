import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const retiredBrand = ["tele", "gram"].join("");
const retiredPrefix = retiredBrand.toUpperCase() + "_";
const textExtensions = new Set([
  ".js", ".mjs", ".json", ".jsonc", ".md", ".html", ".css", ".yml", ".yaml", ".webmanifest", ".gs",
]);

function sourceFiles(root = ".") {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".runtime") continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(file));
    else if (textExtensions.has(path.extname(entry.name))) files.push(file);
  }
  return files;
}

test("retired messaging integration cannot be reintroduced", () => {
  const removedPaths = [
    path.join("backend", "shared", retiredBrand + ".mjs"),
    path.join("backend", "league", retiredBrand + "-notify.mjs"),
    path.join("backend", "infra", retiredBrand + "-webhook"),
    path.join(".github", "workflows", "deploy-" + retiredBrand + "-webhook.yml"),
    path.join(".github", "workflows", "listener.yml"),
    path.join("listener", "bot.mjs"),
  ];
  for (const removed of removedPaths) {
    assert.equal(fs.existsSync(removed), false, `Retired integration path returned: ${removed}`);
  }

  const forbiddenText = [
    retiredBrand,
    retiredPrefix,
    "ballerwatch-" + retiredBrand,
    "/" + retiredBrand,
    "/" + "web" + "pair",
    "/web/user/" + "pair",
  ];

  for (const file of sourceFiles()) {
    if (file.endsWith(path.join("tests", "backend", "infra", "no-retired-messaging.test.mjs"))) continue;
    const value = fs.readFileSync(file, "utf8");
    for (const forbidden of forbiddenText) {
      assert.equal(
        value.toLowerCase().includes(forbidden.toLowerCase()),
        false,
        `Retired messaging reference "${forbidden}" found in ${file}`,
      );
    }
  }
});
