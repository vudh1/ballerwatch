# BallerWatch agent guidance

Keep this public repository free of secrets and live/private soccer data. Runtime plaintext belongs only in ignored temporary paths; persistent private state must remain encrypted.

## Operational skills

- To recover or verify the pickup RSVP `UPSTREAM_ENDPOINT`, follow `skills/find-upstream-endpoint/SKILL.md`. Never commit the discovered endpoint value.
- Product/repository changes must follow the SemVer policy in `README.md` and update `features/versions.json` in the same change set.
- Run the repository validation workflow after changes that affect code, automation, privacy, configuration, or operational guidance.
