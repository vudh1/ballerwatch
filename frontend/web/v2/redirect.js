/**
 * Retired V2 route forwards old links/installs to the canonical root app.
 * Baseline: v9.0.0. Keep query/hash deep links; no account or API changes.
 */
const destination = new URL("../", window.location.href);
destination.search = window.location.search;
destination.hash = window.location.hash;
window.location.replace(destination.href);
