/**
 * Narrow V2 service-worker registration; shares audited push/cache machinery.
 * Baseline: v8.10.0. The imported implementation uses this registration's URL
 * to select V2 launch targets and cache namespaces, independently of V1.
 */
importScripts("../sw.js?v=8.11.2");
