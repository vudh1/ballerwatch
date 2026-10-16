/**
 * Compose one Pages artifact from two independently chosen commits.
 * Production files come only from the production checkout. The main checkout
 * is packaged below /beta/, never written over the live root or runtime-state.
 * This script is source-only and does not deploy or modify either branch.
 */
import fs from "node:fs";
import path from "node:path";

export function composePages(productionRoot, candidateRoot, destination, revision) {
  const prod = path.resolve(productionRoot);
  const main = path.resolve(candidateRoot);
  const out = path.resolve(destination);
  const sha = String(revision || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("A validated 40-character main SHA is required.");
  if ([prod, main].some((dir) => out === dir || out.startsWith(dir + path.sep))) {
    throw new Error("Pages output must be outside both source trees.");
  }
  if (!fs.existsSync(path.join(prod, "index.html")) ||
      !fs.existsSync(path.join(main, "index.html"))) {
    throw new Error("Both production and main PWA source trees are required.");
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(prod, out, { recursive: true });

  // The beta folder is composed from a separate *validated main* checkout.
  // Do not accidentally nest stale, generated preview artifacts.
  const beta = path.join(out, "beta");
  fs.rmSync(beta, { recursive: true, force: true });
  fs.cpSync(main, beta, {
    recursive: true,
    filter: (src) => !path.relative(main, src).split(path.sep).includes("beta"),
  });

  const manifestPath = path.join(beta, "manifest.webmanifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.id = "/ballerwatch/beta/";
  manifest.start_url = "/ballerwatch/beta/";
  manifest.scope = "/ballerwatch/beta/";
  manifest.name = "BallerWatch Beta";
  manifest.short_name = "BW Beta";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const rev = sha.slice(0, 12);
  const htmlPath = path.join(beta, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8")
    .replace("<title>BallerWatch — Your matchday</title>",
      "<title>BallerWatch Beta — Your matchday</title>")
    .replace('content="BallerWatch"', 'content="BallerWatch Beta"')
    .replace('>Pickup + RATS monitor</p>', '>Pickup + RATS monitor · BETA</p>')
    .replace(/(\?v=\d+\.\d+\.\d+)(?=")/g, "$1&beta=" + rev);
  fs.writeFileSync(htmlPath, html);

  const appPath = path.join(beta, "app.js");
  fs.writeFileSync(appPath,
    fs.readFileSync(appPath, "utf8")
      .replace(/(\.\/sw\.js\?v=\d+\.\d+\.\d+)(?=")/g, "$1&beta=" + rev));

  const swPath = path.join(beta, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");
  if (!sw.includes("__BETA_BUILD_ID__")) {
    throw new Error("Beta-aware service worker cache contract is missing.");
  }
  fs.writeFileSync(swPath, sw.replaceAll("__BETA_BUILD_ID__", rev)
    .replace(/(\?v=\d+\.\d+\.\d+)(?=")/g, "$1&beta=" + rev));

  // Old /v2/ is now an alias to /beta/. Keep query strings and fragments.
  // This compatibility redirect is an artifact-only modification: the root
  // production app assets still come exclusively from production.
  const legacy = path.join(out, "v2");
  if (fs.existsSync(path.join(legacy, "index.html"))) {
    fs.writeFileSync(path.join(legacy, "index.html"),
      fs.readFileSync(path.join(legacy, "index.html"), "utf8")
        .replace('content="5;url=../"', 'content="5;url=../beta/"')
        .replace('href="../"', 'href="../beta/"')
        .replace('at its main address', 'at its beta address'));
    fs.writeFileSync(path.join(legacy, "redirect.js"),
`/** Legacy V2 is now the beta alias; preserve query and fragment. */
const destination = new URL("../beta/", window.location.href);
destination.search = window.location.search;
destination.hash = window.location.hash;
window.location.replace(destination.href);
`);
  }
  // Fail closed if an old production subtree shadows the assembled beta.
  if (!fs.existsSync(path.join(beta, "v2", "timeline.js")) ||
      !fs.existsSync(path.join(beta, "lib", "local-match-edits.js"))) {
    throw new Error("Beta must include the full canonical app and its editor.");
  }
  return { production: out, beta, revision: sha };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [prod, main, output, sha] = process.argv.slice(2);
  if (!prod || !main || !output || !sha) {
    throw new Error("Usage: node scripts/build-pages.mjs PRODUCTION_WEB MAIN_WEB OUTPUT VALIDATED_MAIN_SHA");
  }
  const result = composePages(prod, main, output, sha);
  console.log("Pages artifact ready: production root + beta " + result.revision.slice(0, 12));
}
