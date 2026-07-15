# Admin action feedback

Admin mutations return `AdminActionResult`: `{ ok: true, data }` on success or `{ ok: false, message }` on failure.

- State expected failures plainly: name the conflict, invalid field, or missing prerequisite and what to do next.
- Log unexpected server errors with action context; show admins: “Something went wrong [action] — the error has been logged.”
- Use `runAction` for mutations. It gives successes a short toast and failures a persistent toast; forms also retain the message inline.
- Never expose stack traces, SQL, raw provider responses, or secrets.
- Error messages must never reveal another user's data (site names, emails, domains they own).

`runAction` accepts only `AdminActionResult`; callers must convert older result shapes at their action boundary.
