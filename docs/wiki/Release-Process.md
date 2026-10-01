# Release process

1. Create `release/<next-version>` from current `main`.
2. Make implementation/refactor/test commits on the branch.
3. Do not bump the release ledger yet.
4. Run **Validate code** and relevant notification-silent smoke tests.
5. Fix failures on the branch.
6. Update release notes/version only after implementation tests pass.
7. Run final validation.
8. Open/update the PR.
9. Squash merge to `main`.
10. Delete the release branch.

The result is one `main` commit per released version while preserving detailed development commits inside the temporary release branch during implementation.
