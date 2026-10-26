# Quiet Glass mobile acceptance · issue #218

**Scope:** [BallerWatch issue #218](https://github.com/vudh1/ballerwatch/issues/218). This is a **quality-assurance evidence record**, not a release request. Do not close the issue on the strength of code review, Figma, or WebKit emulation alone.

## Design source and provenance

- **Production UI:** `frontend/web/index.html`, `frontend/web/styles.css`, `frontend/web/v2/styles.css`, and their controllers on the explicitly promoted `production` branch.
- **Editable design:** [BallerWatch Figma](https://www.figma.com/design/dv0XebWKIeqq6MuheNMzEh), page **BallerWatch · Mobile flows**. Thirty-two editable frames: 16 states at 390 × 844 CSS px and the corresponding 16 at 430 × 932. The original StatusBadge specimen is preserved.
- **Covered screens:** cinematic landing/Skip; three optional setup steps; Playing; published-date RSVP/withdrawal; Watching day and details; AI Q&A; Inbox/permission; device Settings and calendar link; unselected, stale/offline, rewind, and reduced-motion states.
- **Privacy:** Figma content uses invented/example names, fixtures, fields, and counts. No real RSVP identities, tokens, private profile records, or subscription URLs belong in a design export.
- **Important fidelity limitation:** the first-pass design employs editable Inter text and abstract labels, while the browser uses a system font stack and a real SVG stadium scene. It is a **reference, not pixel-approved source parity**. Match against production screenshots at both sizes before marking design acceptance complete.

## Automated browser checks

`Validate code` exercises Chromium, Firefox, and Playwright WebKit using intercepted **synthetic** APIs, never live user RSVPs or notifications. Existing regression scenarios cover:

- setup/Skip and missing selections; per-device edit persistence and beta isolation;
- Playing and one-mounted-day Watching cards, schedule jumps, long schedule indexing and touch carousel stability;
- rewind gesture thresholds, Skip, reduced-motion and intro asset failure;
- cached/offline fallback and optional provider failures, cross-platform installation guidance;
- published-date RSVP, notification controls, standings and channel display.

The `Quiet Glass 390/430 mobile layout and simulated 200% text` browser scenario added for #218 asserts that the page and Playing/Watching tap targets do not overflow horizontally, are at least 44 CSS px tall, remain interactive with an emulated 200% root font size, and that device Settings remain accessible. **This is a browser simulation, not actual iOS Dynamic Type.** New CI logs, plus screenshot comparisons on device, are needed to call it passed.

## Physical iPhone / accessibility acceptance

Record an evidence row for each test on **both a 390px-class and a 430px-class iPhone**; test Safari and the installed standalone PWA separately. Include: date, device model, physical viewport, iOS version, Safari version, channel/release SHA, local settings, steps, screenshot/video filename, pass/fail and reproduction notes. Use only synthetic or properly anonymized on-device screenshots; do not export a real published RSVP roster into the public repository or Figma.

| Test | Exact pass criteria | Status |
| --- | --- | --- |
| Source-to-Figma | Captured **production** 390/430 screens agree with editable design spacing, content order and states; differences are documented | **Not verified on device** |
| Safe areas / orientation | No notch, Dynamic Island, home bar, keyboard or landscape overlap; dialogs scroll and close without trapping focus | **Not verified on device** |
| 200% text | Native accessibility text-size setting at 200% keeps navigation, cards, Settings and dialogs legible with no cropped primary action | **Not verified on device** |
| Tap targets | Core switches, hub tabs, Skip, calendar actions, roster actions and dialog close targets meet 44 × 44 CSS px where practical | **Not verified on device** |
| VoiceOver and contrast | All controls are named; focus/read order is logical; selected/disabled/offline states are not color-only; text/essential contrast meets WCAG AA | **Not verified on device** |
| Intro / performance | Dashboard usable after Skip; intro launch and reduced-motion bypass timed on physical device; rewind resists accidental pull, but honors deliberate gesture | **Not verified on device** |
| Offline / stale / outage | Last-good status is labeled stale and preferences persist; service failure cannot invent games or silently erase a device profile | **Not verified on device** |
| Notification denial | Permission rejection is recoverable through browser settings; no repeated Push prompt or duplicate alert | **Not verified on device** |
| Events / DST / deep links | Duplicate and canceled events remain stable, 2026-11-01 Pacific DST boundary retains source instants; ICS link/deep-link remain read-only and correct | **Not verified on device** |
| Edge content | Long team names, published roster withdrawals, zero/missing RSVP capacity and empty preferences remain usable | **Not verified on device** |
| Browser/theme fallback | Check Safari/PWA light/dark system modes, reduced transparency and reduced motion without unreadable text or blocking transitions | **Not verified on device** |

### Device QA procedure

1. Confirm the device is showing the intended **production release** or **beta SHA** using the app version label and deployment logs. Beta is a separately cached frontend against the current production Worker, not an independent beta backend.
2. Reset only test-device BallerWatch preferences (never purge production encrypted state). Walk a new-device setup, Skip, Playing/Watching, RSVP date roster, AI hub, Inbox and Settings.
3. Exercise 200% iOS text size and VoiceOver **in Settings on the real iPhone**, then repeat step 2 with the keyboard open, iPhone rotated and reduced-motion/reduced-transparency enabled.
4. On a device with previously saved synthetic/public-safe cards, turn off network access, reload the installed PWA, and verify honest stale messaging. Restore network; verify the next refresh does not duplicate alerts or replace local preferences.
5. Test notification denial without dispatching test Push to real subscribers. Verify calendar/deep-link and Pacific DST cases from the synthetic browser suite or private local test profile.
6. Record screenshots, failures, timings, device/browser build and fix PRs. Link the evidence to #218. Only then mark physical acceptance and close the issue.

## Release and protection boundaries

This documentation and the browser-only regression neither modify backend, weekly sports indexing, encrypted `runtime-state`, push dispatch, RSVP upstream, Cloudflare Worker nor ICS. **No SemVer bump** or production deployment is warranted for a docs/test-only change. If device QA finds a user-visible defect, fix it on a dedicated patch branch, run Validate code and notification-silent smoke as appropriate, merge only after green checks, then request separate explicit production promotion and validate live endpoints. Do not infer live rollout from green PR CI or a Figma frame.

**FRIDAY:** No cross-app runtime contract change. Existing BallerWatch-to-Vela ICS stays intact. No new paid services or personal information.
