import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCombinedVersionAnnouncement,
  pendingReleases,
  planVersionAnnouncement,
} from "../../watchdog/version-announcement.mjs";

const ledger = {
  currentVersion: "2.6.2",
  releases: [
    {
      version: "2.6.2",
      title: "Schedule polish",
      telegramAnnouncement: "Match schedule updates are clearer.",
      changes: ["Internal PR #99 cleanup should never appear in Telegram."],
    },
    {
      version: "2.6.1",
      title: "Quiet notifications",
      telegramAnnouncement: "Telegram now stays quiet during tests and health failures.",
      changes: ["Commit abc123 adjusted CI."],
    },
    { version: "2.6.0", title: "Baseline", changes: ["Old detail"] },
  ],
};

test("collects all releases since the last announced version in chronological order", () => {
  assert.deepEqual(
    pendingReleases(ledger, "2.6.0").map((release) => release.version),
    ["2.6.1", "2.6.2"],
  );
});

test("combined announcement uses user-facing summaries, not engineering change logs", () => {
  const message = formatCombinedVersionAnnouncement(pendingReleases(ledger, "2.6.0"));
  assert.match(message, /v2\.6\.1/);
  assert.match(message, /v2\.6\.2/);
  assert.match(message, /Telegram now stays quiet/);
  assert.doesNotMatch(message, /PR #99|Commit abc123/);
});

test("migration establishes a one-day quiet baseline without losing pending versions", () => {
  const first = planVersionAnnouncement({
    ledger,
    announcementState: {},
    today: "2026-10-01",
  });
  assert.equal(first.message, "");
  assert.equal(first.reason, "migration-baseline");
  assert.equal(first.nextState.lastAnnouncementDate, "2026-10-01");

  const nextDay = planVersionAnnouncement({
    ledger,
    announcementState: first.nextState,
    today: "2026-10-02",
  });
  assert.equal(nextDay.reason, "announce");
  assert.match(nextDay.message, /v2\.6\.1/);
  assert.match(nextDay.message, /v2\.6\.2/);
  assert.equal(nextDay.nextState.lastAnnouncedVersion, "2.6.2");
});

test("never plans more than one version announcement on the same Pacific date", () => {
  const result = planVersionAnnouncement({
    ledger,
    announcementState: {
      initialized: true,
      lastAnnouncedVersion: "2.6.0",
      lastAnnouncementDate: "2026-10-01",
    },
    today: "2026-10-01",
  });
  assert.equal(result.message, "");
  assert.equal(result.reason, "daily-limit");
});
