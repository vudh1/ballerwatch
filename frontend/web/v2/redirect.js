/**
 * Retired V2 route aliases the accountless BallerWatch beta channel.
 * Baseline: v9.0.0. Keep query/hash deep links; no account or API changes.
 */
const destination = new URL("../beta/", window.location.href);
destination.search = window.location.search;
destination.hash = window.location.hash;
window.location.replace(destination.href);
