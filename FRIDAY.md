# BallerWatch × FRIDAY

BallerWatch is the source of truth for sports schedules, pickup tracking, scouting, match settings and notifications. [FRIDAY](https://github.com/vudh1/friday) coordinates optional interfaces; it must not become a runtime prerequisite or hold BallerWatch's private canonical records.

## Integration register

| Capability | Status | Rule |
| --- | --- | --- |
| Sports iCalendar feed used by Vela TV | **Existing** | Preserve direct ICS consumers, privacy, timezones and fallback. A subscription URL may be sensitive. |
| Play RSVP monitoring | **Existing external input** | [nhcuong95/rsvp](https://github.com/nhcuong95/rsvp) owns signups and Sheets/Apps Script. BallerWatch owns its derived tracking/notification logic, not RSVP admin data. |
| FRIDAY event/notification projections | **Proposed** | Minimize and authorize fields; no private roster or per-device settings by default. |
| Cross-app editing or unified account | **Not implemented by this document** | Requires scoped authenticated API, explicit consent/confirmation and tests. |

## Cost boundary

BallerWatch remains on its existing release/monitoring paths. The [FRIDAY cardless rule](https://github.com/vudh1/friday/blob/main/docs/COST_POLICY.md) forbids new payment details or paid/billable provider activation for ecosystem integration without separate owner approval. Free quotas and AI/polling usage must be checked against current vendor terms; the repository cannot establish actual provider invoices. **No billing impact** from this documentation change.

## Design for future use

- Keep encrypted `runtime-state` internal. No direct cross-repository reads, public plaintext snapshots or shared super-token.
- Consider a public-safe event summary only when a consumer needs it. Define schema version, source-qualified ID, category, timestamp/timezone, cancellation, freshness, duplicates, permissions and revocation.
- Maintain BallerWatch functionality when FRIDAY, RSVP or Vela is offline. Do not break existing BallerWatch→Vela ICS as new adapters are designed.
- For every feature decide **No FRIDAY impact** or document owner, consumers, consent, scopes and offline fallback. Cross-app changes require a [FRIDAY issue](https://github.com/vudh1/friday/issues) and reviewed contract.
- Apply [FRIDAY's draft design language](https://github.com/vudh1/friday/blob/main/docs/DESIGN_SYSTEM.md) where practical, while keeping BallerWatch's own styles and releases.

See [AGENTS.md](AGENTS.md). Work on a maintenance/release branch and PR per existing guidance. `main` publishes beta; `production` promotion remains separately controlled. No FRIDAY service is claimed to be deployed here.
