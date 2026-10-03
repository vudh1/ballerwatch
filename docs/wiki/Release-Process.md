# Release Process

BallerWatch uses release-gated production.

1. Create `release/<version>` from latest `main`.
2. Implement and run **Validate code**.
3. Update `features/versions.json` and current docs only after implementation is green.
4. Open PR → `main`.
5. Squash merge after required checks pass.
6. Promotion advances `production` and publishes the GitHub Release.
7. Release-driven Worker deployment migrates/audits encrypted runtime state and performs live PWA/security readiness checks.
8. Only after Worker readiness succeeds does it dispatch Pages deployment.
9. Pages checks out `production`.

Default automatic promotion waits 24 hours and checks eligibility hourly. Manual promotion skips the soak, not validation.

`RELEASE_GITHUB_TOKEN` is repository-scoped with Contents read/write, Workflows read/write, Pages read/write, and Administration read/write. `CRON_GITHUB_PAT` remains dispatch-only.

BallerWatch 6.0 is a major release because it intentionally removes the secondary messaging integration and its recovery path in favor of the web-only PWA and GitHub-native password recovery.
