# Find UPSTREAM_ENDPOINT

Use this runbook when BallerWatch needs to recover, verify, or explain the pickup RSVP `UPSTREAM_ENDPOINT`.

## Privacy rule

Never commit the discovered endpoint value to BallerWatch. Keep the endpoint in the GitHub Actions secret `UPSTREAM_ENDPOINT`, or in BallerWatch's encrypted Telegram override. Do not add live RSVP data, player names, field details, or response payloads to the repository.

## Source of truth

The pickup RSVP frontend is maintained separately from BallerWatch. Inspect the frontend JavaScript that the published RSVP page actually loads. In the current upstream repository, the main frontend file is `app.js`.

Find the constant used by normal RSVP requests, currently named `APPS_SCRIPT_URL`.

Do **not** use a similarly named admin/backend constant such as `ADMIN_APPS_SCRIPT_URL`. BallerWatch needs the normal RSVP data endpoint, not the administration endpoint.

## Discovery procedure

1. Fetch the current upstream RSVP frontend source from its repository or published site.
2. Locate the normal RSVP request function and trace the URL it uses.
3. Identify the value assigned to `APPS_SCRIPT_URL` (or its future equivalent).
4. Treat the canonical endpoint as the base web-app URL only. Remove accidental analytics/tracking query parameters. A Google Apps Script web-app endpoint normally ends in `/exec`.
5. Verify that the same endpoint is used for the public RSVP data actions BallerWatch consumes, including:
   - `action=listPlayDates`
   - `action=list`
6. Never choose the admin endpoint merely because it is also a Google Apps Script `/exec` URL.
7. Store the verified value as the repository Actions secret `UPSTREAM_ENDPOINT`. Never write the value into tracked BallerWatch source.

## Verification

A valid endpoint must:
- use HTTPS;
- be the endpoint used by the normal public RSVP frontend;
- support the public read actions BallerWatch needs;
- not be the admin endpoint;
- not contain ChatGPT, browser, or analytics tracking parameters.

After changing the secret, run the pickup/manual smoke workflow and confirm the source refresh succeeds. Do not print or persist the fetched live RSVP payload.

## If the upstream site changes

Do not guess a replacement endpoint. Trace the current frontend request path again. If the constant name changes, follow the code from the public RSVP date/list request to its actual network URL. Update this runbook only if the discovery procedure itself changes; never update it with the live endpoint value.
