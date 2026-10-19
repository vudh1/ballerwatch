# Scouting and forecasts

BallerWatch prepares scouting once in GitHub Actions, then serves encrypted projections through the Worker. Browser requests do not scan the historical archive, train models or ask an LLM to invent a probability. Beta source: **11.2.0**. Production remains on its separately promoted release.

## Report evidence

Reports include current standings, last-five form, last-ten weighted results, attack/defense rates and ranks, indexed historical matches, format splits, and a new match-preparation briefing. Every briefing sentence is produced from a bounded catalogue of scored-result facts. Thin samples, partial archives and unobserved lineup/injury information remain visible. Tactical preparation suggestions are conditional on observed scoring ranks, not claims about unseen formations or players.

The hourly cache job may ask Gemini and Groq to rank up to 12 report fact catalogues, at most once per 24-hour attempt window. Requests use anonymous report IDs and aggregate public statistics. Both providers must select existing IDs; only their agreed selections influence ordering. Invalid responses, disagreement, absent credentials or outages preserve deterministic reports. No provider prose, user settings, chat, RSVP names or private roster data is sent. Changed evidence invalidates old selections immediately, even during the daily quota window.

## Probability model

Published cross-division fixtures count as full scored matches for **both teams' current-season league records**. Each club remains ranked only among clubs in its own division. For scouting, the normal latest-ten scored matches include such games; the opponent's published tier is used as a bounded 0.8–1.25 relative weighting factor (neutral for unknown tiers). This also applies to the holdout evaluator, which uses past data only. It does not assume every team plays exactly ten matches or guarantee a calibrated improvement.

The reviewed champion uses recent weighted results, division tier, format and head-to-head meetings. 9.1 adds a challenger combining that model with independent Poisson goal rates, regularized toward a neutral two-goal prior. Extreme scores are capped only for predictor influence; match records remain untouched. Ensemble influence shrinks with the smaller team's sample, reaching zero when either team has no scored history. Three-way estimates are normalized, finite, non-negative and rounded to five-percentage-point steps that sum to 100. With missing or invalid inputs, the display uses a conservative prior rather than invalid percentages.

The hourly scouting writer checks whether evaluation is due: no valid model, a season/policy change, or seven days since its last evaluation. It runs evaluation and then rebuilds projections in the same serialized job; repeated promotion events cannot replace a separate queued model job. The workflow checks out `production`, reads encrypted history in memory and asks both providers for up to three bounded goal-model configurations using **development aggregates only**. Candidate blend, prior and decay values are allowlisted and rescored numerically. Provider suggestions cannot directly edit weights or outputs.

Selection uses completed development seasons, excluding the newest completed season and current season. The selected challenger then faces the newest completed season as a held-out chronological replay. All games on a date are predicted before any of that date's outcomes update history. Calibration and replay share format/tier parsing and the same forecasting function used by prepared cards.

An ensemble is eligible only when all of these pass:

- at least 100 scored holdout fixtures across 12 date groups;
- holdout log-loss improvement of at least 0.005 over the actual production champion;
- positive lower 95% paired date-group improvement bound;
- no worse multiclass Brier score than the champion;
- lower held-out log loss than league-average, goal-difference and Elo baselines.

These are conservative operational gates, not proof that future forecasts are calibrated. Repeated weekly reuse of a completed season is not a fresh independent experiment. No tenfold accuracy claim is made. Log loss and Brier are proper probability scores, not accuracy percentages; the AI's model-performance answer now reports the actual published validation metadata.

## State and failure behavior

`league/state/scout-model.json` stores the selected weights and aggregate evaluation metadata in a complete AES-GCM envelope. The hourly builder uses an eligible same-season candidate while its eight-day eligibility is valid at publication; otherwise it uses the release-reviewed champion. If background preparation is unavailable, last-known projections retain their source timestamps and may be stale. A failed gate explicitly publishes champion status. Missing providers do not prevent numerical baseline evaluation or ordinary report preparation.

`league/state/scout-index.json` holds the complete encrypted serving projection, report facts and bounded daily ranking cache. Neither raw history nor plaintext derived data is committed to source. Model and projection preparation share one `ballerwatch-league` job and the existing runtime snapshot reconciler. They do not deliver Web Push or change Calendar events. PURGE covers these generated paths through the canonical runtime scope.

Aggregate Actions output records model status, holdout counts, log loss, Brier, draw recall, top-choice calibration error, proposal count and the paired lower bound. Reliability buckets reflect scored-game coverage; a short head-to-head history is not high confidence. The hourly job records the serving model. Inspect those results before claiming a measured improvement; a retained champion is an expected safe outcome.

## Reading the beta forecast

The match strip has three ordered segments: monitored-team win, tie, and opponent win. Only the two teams' winning percentages are labeled visually; the middle tie share remains in the bar and its accessible description, and can be inferred from the two win percentages. CamelCase names such as PhoSaiGon abbreviate to PSG. Reliability depends on the smaller team's available recent scored-game count: fewer than three is **Insufficient history**, three to five is **Low**, six to nine is **Moderate**, and ten or more has **Stronger historical coverage**. The label describes evidence availability, not certainty or prediction accuracy. For numerical evaluation, draw recall measures correct draw-as-top-choice predictions divided by actual draws; expected calibration error is ten-bin absolute difference between top-choice confidence and observed top-choice correctness, weighted by sample count. Both are computed on chronological holdout matches. The reviewed champion remains the safe default unless the independent holdout gate passes; a candidate is not a demonstrated improvement merely because its code exists.

## Read-only real-archive benchmark

The dedicated [Read-only scouting evaluation](https://github.com/vudh1/ballerwatch/actions/workflows/scouting-evaluation-readonly.yml) workflow can replay the encrypted historical RATS aggregate archive with the same chronological holdout without changing the cached predictions, writing runtime state, sending notifications or invoking production promotion. It publishes only aggregate comparison metrics in its Actions job output; decrypted temporary files are cleaned after each run. Results from a live archive are diagnostic and do not automatically update the production or beta model.
