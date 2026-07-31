# Admin action feedback

Admin mutations return `AdminActionResult`: `{ ok: true, data }` on success or `{ ok: false, message }` on failure.

- State expected failures plainly: name the conflict, invalid field, or missing prerequisite and what to do next.
- Log unexpected server errors with action context; show admins: “Something went wrong [action] — the error has been logged.”
- Use `runAction` for mutations. It gives successes a short toast and failures the shared error toast; forms also retain the message inline.
- **One home for every failure** (`src/lib/error-toast.ts`): a failed click reports through `showErrorToast` — one persistent red toast at the top center, where a repeat failure replaces the previous message instead of stacking, starting a new attempt (`dismissErrorToast`, called automatically by `runAction`) clears it, and navigating away clears it. Never call `toast.error` directly, and never pop a dialog just to show an error.
- A delete that fails while its confirm dialog is open keeps the message inline in `ConfirmDestructive` (its `error` prop) so the answer sits next to the question.
- A failed **load** belongs to the surface that failed, not a toast: pass `error={{ message, onRetry }}` to `AdminTableShell` and the shared `ErrorBanner` (`src/components/ui/error-banner.tsx`) renders between the toolbar and the column headers, with the empty state beneath it. Non-table surfaces render `ErrorBanner` directly. Never draw a load error as red text inside the table body.
- Field validation reports on blur or submit with `aria-invalid` on the input — never per keystroke, and never a disabled button with no message.
- Never expose stack traces, SQL, raw provider responses, or secrets.
- Error messages must never reveal another user's data (site names, emails, domains they own).

`runAction` accepts only `AdminActionResult`; callers must convert older result shapes at their action boundary.
