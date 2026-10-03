# Release Process

BallerWatch uses release-gated production.

1. Create `release/<version>` from latest `main`.
2. Implement and run **Validate code**.
3. Run notification-silent **Manual smoke test** for runtime-affecting changes.
4. Update `features/versions.json` and current docs only after implementation is green.
5. Open PR → `main`.
6. Squash merge after required checks pass.
7. Promotion advances `production` and publishes the GitHub Release.
8. Release-driven Worker deployment migrates/audits encrypted runtime state and performs live PWA/security readiness checks.
9. Only after Worker readiness succeeds does it dispatch Pages deployment.
10. Pages checks out `production`.

Default automatic promotion waits 24 hours and checks eligibility hourly. Manual promotion skips the soak, not validation.

`RELEASE_GITHUB_TOKEN` is repository-scoped with Contents read/write, Workflows read/write, Pages read/write, and Administration read/write. `CRON_GITHUB_PAT` remains dispatch-only.

BallerWatch 6.0 is a major release because it intentionally removes the secondary messaging integration and its recovery path in favor of the web-only PWA and GitHub-native password recovery.
