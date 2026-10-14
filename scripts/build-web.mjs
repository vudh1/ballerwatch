/**
 * Validates and packages the dependency-free GitHub Pages production surface.
 * Baseline: v8.10.0. Copies source-only static assets; never reads runtime-state.
 */
import fs from "node:fs";
import path from "node:path";

const source = path.resolve("frontend/web");
const destination = path.resolve(process.argv[2] || "/tmp/ballerwatch-web-build");
if (destination === source || destination.startsWith(source + path.sep)) {
  throw new Error("Build destination must be outside the web source.");
}
for (const route of ["", "v2/"]) {
  const html = fs.readFileSync(path.join(source, route, "index.html"), "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!match[1].startsWith(".")) continue;
    const file = path.resolve(source, route, match[1].split("?")[0]);
    if (!file.startsWith(source) || !fs.existsSync(file)) {
      throw new Error(`Missing local asset in /${route}: ${match[1]}`);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(source, route, "manifest.webmanifest"), "utf8"));
  if (manifest.start_url !== `/ballerwatch/${route}` || manifest.scope !== `/ballerwatch/${route}`) {
    throw new Error(`Incorrect production base path for /${route}`);
  }
}
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });
console.log(`Static production build ready: ${destination} (V1 + V2)`);
