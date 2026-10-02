# Release process

BallerWatch separates **merging** from **production promotion**.

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

## Promote production

`main` is integration. `production` is what live runtime/deploy workflows execute.

The hourly **Promote production release** workflow:

1. reads the current product version from `main`;
2. verifies a successful validation run for that candidate commit;
3. on the automatic path, waits until the candidate has soaked for at least 24 hours;
4. creates/publishes the GitHub Release/tag;
5. advances `production` to that exact commit;
6. release-triggered deploy workflows deploy the tagged version.

A manual run skips the soak but still requires validation.

If a GitHub Release for the current version already exists, promotion is a no-op. This lets maintenance commits merge later without redeploying or inventing a version.

## Release credential

Use `RELEASE_GITHUB_TOKEN` as a fine-grained repository token with **Contents: read/write** and **Workflows: read/write**. GitHub requires workflow-write authorization when the release target modifies `.github/workflows/`. Scheduler dispatches continue to use `CRON_GITHUB_PAT` separately.

If neither credential can create the Release, promotion fails closed and `production` stays pinned.

## Branch cleanup

After merge, **Cleanup merged release branches** deletes closed stale `release/*` and `fix/*` branches. `main`, `production`, and `runtime-state` are durable branches and must remain.
