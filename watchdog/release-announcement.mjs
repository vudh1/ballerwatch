/**
 * Plans quiet, at-most-daily combined Web Push release announcements.
 *
 * This module is pure policy logic: it never sends notifications or reads
 * private runtime state directly.
 */
export const ANNOUNCEMENT_BASELINE_VERSION = "2.5.6";

function releaseSummary(release) {
  return String(release?.webAnnouncement || release?.title || "BallerWatch update").trim();
}

export function pacificDate(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function pendingReleases(ledger, lastAnnouncedVersion) {
  const releases = Array.isArray(ledger?.releases) ? ledger.releases : [];
  const pending = [];
  for (const release of releases) {
    if (String(release?.version || "") === String(lastAnnouncedVersion || "")) break;
    if (release?.version) pending.push(release);
  }
  return pending.reverse();
}

export function formatCombinedVersionAnnouncement(releases) {
  const items = Array.isArray(releases) ? releases : [];
  if (!items.length) return "";

  const lines = ["🆕 BallerWatch daily update"];
  for (const release of items) {
    lines.push(`• v${release.version} — ${releaseSummary(release)}`);
  }
  lines.push("Open BallerWatch for the current release details.");
  return lines.join("\n");
}

export function planVersionAnnouncement({
  ledger,
  announcementState = {},
  today = pacificDate(),
} = {}) {
  const currentVersion = String(ledger?.currentVersion || "").trim();
  if (!currentVersion) {
    return { message: "", nextState: announcementState, reason: "no-version" };
  }

  const lastVersion = String(
    announcementState?.lastAnnouncedVersion || ANNOUNCEMENT_BASELINE_VERSION,
  ).trim();
  const lastDate = String(announcementState?.lastAnnouncementDate || "").trim();

  if (!announcementState?.initialized) {
    return {
      message: "",
      nextState: {
        initialized: true,
        lastAnnouncedVersion: lastVersion,
        lastAnnouncementDate: today,
      },
      reason: "migration-baseline",
    };
  }

  if (lastDate === today) {
    return { message: "", nextState: announcementState, reason: "daily-limit" };
  }

  const pending = pendingReleases(ledger, lastVersion);
  if (!pending.length) {
    return { message: "", nextState: announcementState, reason: "nothing-new" };
  }

  return {
    message: formatCombinedVersionAnnouncement(pending),
    nextState: {
      initialized: true,
      lastAnnouncedVersion: currentVersion,
      lastAnnouncementDate: today,
    },
    reason: "announce",
  };
}
