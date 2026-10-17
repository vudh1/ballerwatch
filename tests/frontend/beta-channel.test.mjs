import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { composePages } from "../../scripts/build-pages.mjs";

function put(root, file, body) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}
const manifest = (scope) => JSON.stringify({
  id: scope, start_url: scope, scope, name: "BallerWatch",
}, null, 2);

test("Pages artifact keeps production intact and adds validated main at a distinct beta scope", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bw-beta-composition-"));
  try {
    const prod = path.join(tmp, "production");
    const main = path.join(tmp, "main");
    const output = path.join(tmp, "pages");
    put(prod, "index.html", "RELEASED_PRODUCTION_APP");
    put(prod, "v2/index.html", '<meta content="5;url=../"><a href="../">at its main address</a>');
    put(prod, "v2/redirect.js", "old redirect");
    put(main, "index.html", '<title>BallerWatch — Your matchday</title><meta content="BallerWatch"><p>Pickup + RATS monitor</p><script src="./app.js?v=11.1.0"></script>');
    put(main, "manifest.webmanifest", manifest("/ballerwatch/"));
    put(main, "app.js", 'navigator.serviceWorker.register("./sw.js?v=11.1.0");');
    put(main, "sw.js", 'const CACHE = "ballerwatch-beta-__BETA_BUILD_ID__-shell"; const ASSET = "./app.js?v=11.1.0";');
    put(main, "v2/timeline.js", "timeline");
    put(main, "lib/local-match-edits.js", "local edits");
    const sha = "a".repeat(40);
    const result = composePages(prod, main, output, sha);
    assert.equal(result.revision, sha);
    assert.equal(fs.readFileSync(path.join(output, "index.html"), "utf8"), "RELEASED_PRODUCTION_APP");
    const betaHtml = fs.readFileSync(path.join(output, "beta/index.html"), "utf8");
    assert.match(betaHtml, /BallerWatch Beta — Your matchday/);
    assert.match(betaHtml, /RATS monitor · BETA/);
    assert.match(betaHtml, /app\.js\?v=11\.1\.0&beta=aaaaaaaaaaaa/);
    const betaManifest = JSON.parse(fs.readFileSync(path.join(output, "beta/manifest.webmanifest"), "utf8"));
    assert.equal(betaManifest.id, "/ballerwatch/beta/");
    assert.equal(betaManifest.start_url, "/ballerwatch/beta/");
    assert.equal(betaManifest.scope, "/ballerwatch/beta/");
    assert.equal(betaManifest.name, "BallerWatch Beta");
    assert.match(fs.readFileSync(path.join(output, "beta/sw.js"), "utf8"), /ballerwatch-beta-aaaaaaaaaaaa-shell/);
    assert.match(fs.readFileSync(path.join(output, "beta/app.js"), "utf8"), /sw\.js\?v=11\.1\.0&beta=aaaaaaaaaaaa/);
    assert.match(fs.readFileSync(path.join(output, "v2/redirect.js"), "utf8"), /new URL\("\.\.\/beta\/", window\.location\.href\)/);
    assert.match(fs.readFileSync(path.join(output, "v2/index.html"), "utf8"), /url=\.\.\/beta\//);
    assert.match(fs.readFileSync(path.join(output, "v2/sw.js"), "utf8"),
      /importScripts\("\.\.\/beta\/sw\.js\?beta=aaaaaaaaaaaa"\)/);
    // Output never persists runtime files or moves a source branch.
    assert.equal(fs.existsSync(path.join(output, "runtime-state")), false);
    assert.throws(() => composePages(prod, main, output, "main"), /validated/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("match override key belongs to the local environment, not an account", () => {
  const source = fs.readFileSync("frontend/web/lib/local-match-edits.js", "utf8")
    .split("const MAX_ITEMS")[0].replaceAll("export ", "");
  const evaluate = (pathname) => vm.runInNewContext(
    source + "\nLOCAL_MATCH_EDITS_KEY",
    { window: { location: { pathname } } },
  );
  assert.equal(evaluate("/ballerwatch/"), "ballerwatch:local-match-edits:v1");
  assert.equal(evaluate("/ballerwatch/beta/"), "ballerwatch:beta:local-match-edits:v1");
});

test("Pages workflow only publishes validated main and never deploys main at production root", () => {
  const workflow = fs.readFileSync(".github/workflows/pages.yml", "utf8");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /ref: production/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /merge-base --is-ancestor/);
  assert.match(workflow, /main-src\/scripts\/build-pages\.mjs/);
  assert.match(workflow, /production-src\/frontend\/web main-src\/frontend\/web/);
  assert.match(workflow, /path: \/tmp\/ballerwatch-pages/);
  assert.doesNotMatch(workflow, /path: frontend\/web/);
});

test("channel selector is shipped only as beta source and not injected into production checkout", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");
  assert.match(html, /id="app-channel"/);
  assert.match(html, /Beta — preview features before production/);
  assert.match(sw, /"\.\/lib\/app-channel\.js"/);
  assert.match(fs.readFileSync("frontend/web/app.js","utf8"), /switchChannel\(target\)/);
});
