/**
 * BallerWatch repository style checker.
 *
 * Documentation baseline: v2.3.0.
 * This dependency-free checker enforces cross-language whitespace and module-documentation rules.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set([".git", "node_modules"]);
const TEXT_EXTENSIONS = new Set([
  ".mjs", ".js", ".json", ".jsonc", ".yml", ".yaml", ".md", ".py", ".html", ".css",
]);

function walk(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) output.push(full);
  }
  return output;
}

const problems = [];
for (const file of walk(ROOT)) {
  const relative = path.relative(ROOT, file).replaceAll("\\", "/");
  const text = fs.readFileSync(file, "utf8");
  if (!text.endsWith("\n")) problems.push(`${relative}: missing final newline`);
  if (/\r/.test(text)) problems.push(`${relative}: CRLF line endings are not allowed`);
  text.split("\n").forEach((line, index) => {
    if (/[ \t]+$/.test(line)) problems.push(`${relative}:${index + 1}: trailing whitespace`);
  });

  if (relative.endsWith(".mjs") && !relative.endsWith(".test.mjs")) {
    const first = text.trimStart();
    if (!first.startsWith("/**")) problems.push(`${relative}: runtime module needs a leading documentation block`);
  }
  if (relative.endsWith(".py") && !relative.endsWith("_test.py")) {
    const first = text.trimStart();
    if (!first.startsWith('"""') && !first.startsWith("'''")) {
      problems.push(`${relative}: Python runtime module needs a leading module docstring`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Style check passed for ${walk(ROOT).length} text files.`);
