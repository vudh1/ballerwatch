import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_DIRS = [
  "infra",
  "league",
  "pickup",
  "shared",
  "watchdog",
  "weather",
  "tests",
];

function sourceFiles(directory) {
  const root = path.join(ROOT, directory);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path.relative(ROOT, target)));
    else if (/\.(?:mjs|js)$/.test(entry.name)) out.push(target);
  }
  return out;
}

function relativeImports(source) {
  const imports = [];
  for (const match of source.matchAll(/(?:from\s+|import\s*\()["'](\.{1,2}\/[^"']+)["']/g)) {
    imports.push(match[1]);
  }
  return imports;
}

test("all relative JavaScript imports resolve to repository files", () => {
  const missing = [];
  for (const file of SOURCE_DIRS.flatMap(sourceFiles)) {
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of relativeImports(source)) {
      const resolved = path.resolve(path.dirname(file), specifier);
      if (!fs.existsSync(resolved)) {
        missing.push(`${path.relative(ROOT, file)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
