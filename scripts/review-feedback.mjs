import fs from "node:fs";
import path from "node:path";
import { decryptState } from "../backend/shared/state-crypto.mjs";
import { isPublicRequestSummary } from "../backend/shared/feature-request-summary.mjs";

function loadEncrypted(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const value = decryptState(raw);
  if (!value) throw new Error(`Unable to decrypt ${file}`);
  return value;
}

function safeReview(value) {
  const signals = Array.isArray(value?.signals) ? value.signals : [];
  return {
    version: Number(value?.version || 1),
    generatedAt: String(value?.generatedAt || ""),
    signals: signals.slice(-100).map((signal) => ({
      kind: String(signal?.kind || "").slice(0, 40),
      summary: String(signal?.summary || "").slice(0, 220),
      reason: String(signal?.reason || "").slice(0, 220),
    })),
  };
}

function safeRequests(value) {
  if (!isPublicRequestSummary(value)) {
    throw new Error("Feature request summary is not the expected privacy-safe schema.");
  }
  return value;
}

const root = process.argv[2] || "runtime";
const review = safeReview(loadEncrypted(path.join(root, "state/chat-review.json")));
const requests = safeRequests(loadEncrypted(path.join(root, "requests/unknown.json")));
const output = { review, requests };

console.log(`SAFE_ENGINEERING_REVIEW=${JSON.stringify(output)}`);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const lines = [
    "# BallerWatch safe engineering review",
    "",
    "## Review signals",
    review.signals.length
      ? review.signals.map((signal) =>
          `- **${signal.kind || "unknown"}** — ${signal.summary || "No summary"}${signal.reason ? ` — ${signal.reason}` : ""}`
        ).join("\n")
      : "- No active review signals.",
    "",
    "## Feature request categories",
    requests.requests.length
      ? requests.requests.map((item) =>
          `- **${item.category}**: ${item.count} total (${item.manual} manual, ${item.thumbsDown} thumbs-down)`
        ).join("\n")
      : "- No recorded feature request categories.",
    "",
    "_Only the pre-sanitized chat-review projection and category-only request summary are read. Raw chat history and private request text are never opened._",
    "",
  ];
  fs.appendFileSync(summaryPath, lines.join("\n"));
}
