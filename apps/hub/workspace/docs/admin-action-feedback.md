# Admin action feedback

Admin mutations return `AdminActionResult`: `{ ok: true, data }` on success or `{ ok: false, message }` on failure.

- State expected failures plainly: name the conflict, invalid field, or missing prerequisite and what to do next.
- Log unexpected server errors with action context; show admins: “Something went wrong [action] — the error has been logged.”
- Use `runAction` for mutations. It gives successes a short toast and failures a persistent toast; forms also retain the message inline.
- Never expose stack traces, SQL, raw provider responses, or secrets.
- Error messages must never reveal another user's data (site names, emails, domains they own).

## Rollout status

Only the mail actions (`mail-actions.ts`) return `AdminActionResult` so far. `runAction` also accepts the legacy `{ success, error }` shape purely as a transition bridge — delete `LegacyActionResult` from `admin-action-feedback.ts` once the site, media, and template action families are converted to `AdminActionResult`.
