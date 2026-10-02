# Release process

BallerWatch separates **merging** from **production promotion**.

All repository changes are branch-first. Create the working branch from the latest `main`, do the work there, and merge through a PR only after verification. Do not commit maintenance, release, documentation, workflow, or product changes directly to `main`.

## Build the product release

1. Create `release/<next-version>` from current `main`.
2. Implement/refactor/test on that branch.
3. Do not bump `features/versions.json` yet.
4. Get **Validate code** green.
5. For runtime-affecting work, run the notification-silent **Manual smoke test**.
6. Fix failures rather than bypassing them.
7. Update the release ledger, PWA asset version, and current docs only after implementation is green.
8. Run final validation/smoke.
9. Mark the PR ready.
10. **Squash merge** to `main`.

The release branch can contain detailed implementation commits; `main` receives one product-release commit.

## Maintenance changes

Maintenance follows the same branch-first rule without inventing a product release:

1. Update local context from the latest `main`.
2. Create `maintenance/<topic>` (or `fix/<topic>` for a focused fix) from that exact `main`.
3. Make and verify the maintenance changes on that branch.
4. Open a PR to `main`.
5. Merge only when the branch is complete and the relevant checks are green.
6. Delete the merged working branch when practical.

Do not bump `features/versions.json` for documentation-only edits, behavior-preserving refactors, CI/workflow housekeeping, or other non-product maintenance.

## Promote production

`main` is integration. `production` is what live runtime/deploy workflows execute.

The hourly **Promote production release** workflow:

1. reads the current product version from `main`;
2. verifies a successful validation run for that candidate commit;
3. on the automatic path, waits until the candidate has soaked for at least 24 hours;
4. creates/publishes the GitHub Release/tag;
5. advances `production` to that exact commit;
6. Worker/Calendar/weather/web-runtime and Pages release listeners deploy the tagged version; Pages always checks out `production`, and its workflow can re-enable the Pages site if repository Pages activation is missing.

A manual run skips the soak but still requires validation. Worker deployment is not considered healthy until the deployed runtime passes notification-silent readiness checks for health/config plus the runtime-backed next-game and calendar APIs.

If a GitHub Release for the current version already exists, promotion is a no-op. This lets maintenance commits merge later without redeploying or inventing a version.

## Release credential

Use `RELEASE_GITHUB_TOKEN` as a fine-grained repository token scoped only to this repository with **Contents: read/write**, **Workflows: read/write**, **Pages: read/write**, and **Administration: read/write**. Contents access is also installed into the Worker as `GITHUB_CONTENTS_TOKEN` for encrypted `runtime-state` reads/writes. GitHub requires workflow-write authorization when a release target modifies `.github/workflows/`; Pages + Administration write are required only so the Pages workflow can recreate/enable the Pages site if its repository-level activation is missing. Scheduler dispatches continue to use `CRON_GITHUB_PAT` separately and must not be used as the PWA content credential.

If neither credential can create the Release, promotion fails closed and `production` stays pinned.

## Branch cleanup

After merge, **Cleanup merged working branches** deletes closed stale `release/*`, `maintenance/*`, and `fix/*` branches. `main`, `production`, and `runtime-state` are durable branches and must remain.
