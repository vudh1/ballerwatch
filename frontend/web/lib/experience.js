/**
 * Route-specific frontend configuration shared by the V1 and V2 controllers.
 * Baseline: v8.10.0. Only presentation preferences are isolated; authentication,
 * account settings, notifications and API contracts remain the existing system.
 */
export const isV2 = /\/v2(?:\/|$)/.test(window.location.pathname);

export function experienceKey(legacyKey, name) {
  return isV2 ? `ballerwatch:v2:${name}` : legacyKey;
}
