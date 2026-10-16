# Scouting and forecasts

BallerWatch prepares scouting once in GitHub Actions, then serves encrypted projections through the Worker. Browser requests do not scan the historical archive, train models or ask an LLM to invent a probability. Current release: **9.1.0**.

## Report evidence

Reports include current standings, last-five form, last-ten weighted results, attack/defense rates and ranks, indexed historical matches, format splits, and a new match-preparation briefing. Every briefing sentence is produced from a bounded catalogue of scored-result facts. Thin samples, partial archives and unobserved lineup/injury information remain visible. Tactical preparation suggestions are conditional on observed scoring ranks, not claims about unseen formations or players.

The hourly cache job may ask Gemini and Groq to rank up to 12 report fact catalogues, at most once per 24-hour attempt window. Requests use anonymous report IDs and aggregate public statistics. Both providers must select existing IDs; only their agreed selections influence ordering. Invalid responses, disagreement, absent credentials or outages preserve deterministic reports. No provider prose, user settings, chat, RSVP names or private roster data is sent. Changed evidence invalidates old selections immediately, even during the daily quota window.

## Probability model

The reviewed champion uses recent weighted results, division tier, format and head-to-head meetings. 9.1 adds a challenger combining that model with independent Poisson goal rates, regularized toward a neutral two-goal prior. Extreme scores are capped only for predictor influence; match records remain untouched. Ensemble influence shrinks with the smaller team's sample, reaching zero when either team has no scored history. Three-way estimates still round to five percentage points and sum to 100.

Weekly evaluation runs on Monday at 09:23 UTC and after production promotion. It checks out `production`, reads encrypted history in memory and asks both providers for up to three bounded goal-model configurations using **development aggregates only**. Candidate blend, prior and decay values are allowlisted and rescored numerically. Provider suggestions cannot directly edit weights or outputs.

Selection uses completed development seasons, excluding the newest completed season and current season. The selected challenger then faces the newest completed season as a held-out chronological replay. All games on a date are predicted before any of that date's outcomes update history. Calibration and replay share format/tier parsing and the same forecasting function used by prepared cards.

An ensemble is eligible only when all of these pass:

- at least 100 scored holdout fixtures across 12 date groups;
- holdout log-loss improvement of at least 0.005 over the actual production champion;
- positive lower 95% paired date-group improvement bound;
- no worse multiclass Brier score than the champion;
- lower held-out log loss than league-average, goal-difference and Elo baselines.

These are conservative operational gates, not proof that future forecasts are calibrated. Repeated weekly reuse of a completed season is not a fresh independent experiment. No tenfold accuracy claim is made. Log loss and Brier are proper probability scores, not accuracy percentages; the AI's model-performance answer now reports the actual published validation metadata.

## State and failure behavior

`league/state/scout-model.json` stores the selected weights and aggregate evaluation metadata in a complete AES-GCM envelope. The hourly builder uses an eligible same-season candidate for at most eight days; otherwise it uses the release-reviewed champion. A failed gate explicitly publishes champion status. Missing providers do not prevent numerical baseline evaluation or ordinary report preparation.

`league/state/scout-index.json` holds the complete encrypted serving projection, report facts and bounded daily ranking cache. Neither raw history nor plaintext derived data is committed to source. Both jobs share `ballerwatch-league` concurrency and the existing runtime snapshot reconciler. They do not deliver Web Push or change Calendar events. PURGE covers these generated paths through the canonical runtime scope.

Aggregate Actions output records model status, holdout counts, log loss, Brier, proposal count and the paired lower bound. The hourly job records the serving model. Inspect those results before claiming a measured improvement; a retained champion is an expected safe outcome.
