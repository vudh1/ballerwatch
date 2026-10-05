import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCombinedVersionAnnouncement,
  pendingReleases,
  planVersionAnnouncement,
} from "../../../backend/watchdog/release-announcement.mjs";

const ledger = {
  currentVersion: "6.0.0",
  releases: [
    {
      version: "6.0.0",
      title: "Web-only runtime",
      webAnnouncement: "BallerWatch is now web-only with Web Push notifications.",
      changes: ["Internal migration detail should not appear in the release alert."],
    },
    {
      version: "5.8.2",
      title: "Security hardening",
      webAnnouncement: "Security and Web Push protections were strengthened.",
      changes: ["Commit detail should not appear."],
    },
    { version: "5.8.1", title: "Baseline", changes: ["Old detail"] },
  ],
};

test("collects releases since the last announced version in chronological order", () => {
  assert.deepEqual(
    pendingReleases(ledger, "5.8.1").map((release) => release.version),
    ["5.8.2", "6.0.0"],
  );
});

test("combined announcement uses user-facing web summaries, not engineering logs", () => {
  const message = formatCombinedVersionAnnouncement(pendingReleases(ledger, "5.8.1"));
  assert.match(message, /v5\.8\.2/);
  assert.match(message, /v6\.0\.0/);
  assert.match(message, /web-only/);
  assert.doesNotMatch(message, /Internal migration detail|Commit detail/);
});

test("migration establishes a one-day quiet baseline without losing pending versions", () => {
  const first = planVersionAnnouncement({
    ledger,
    announcementState: {},
    today: "2026-10-02",
  });
  assert.equal(first.message, "");
  assert.equal(first.reason, "migration-baseline");

  const nextDay = planVersionAnnouncement({
    ledger,
    announcementState: first.nextState,
    today: "2026-10-03",
  });
  assert.equal(nextDay.reason, "announce");
  assert.match(nextDay.message, /v6\.0\.0/);
  assert.equal(nextDay.nextState.lastAnnouncedVersion, "6.0.0");
});

test("never plans more than one release announcement on the same Pacific date", () => {
  const result = planVersionAnnouncement({
    ledger,
    announcementState: {
      initialized: true,
      lastAnnouncedVersion: "5.8.1",
      lastAnnouncementDate: "2026-10-02",
    },
    today: "2026-10-02",
  });
  assert.equal(result.message, "");
  assert.equal(result.reason, "daily-limit");
});
