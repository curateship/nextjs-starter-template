# Admin action feedback

Admin mutations return `AdminActionResult`: `{ ok: true, data }` on success or `{ ok: false, message }` on failure.

- State expected failures plainly: name the conflict, invalid field, or missing prerequisite and what to do next.
- Log unexpected server errors with action context; show admins: “Something went wrong [action] — the error has been logged.”
- Use `runAction` for mutations. It gives successes a short toast and failures the shared error toast; forms also retain the message inline.
- **One home for every failure** (`src/lib/error-toast.ts`): a failed click reports through `showErrorToast` — one persistent red toast at the top center, where a repeat failure replaces the previous message instead of stacking, starting a new attempt (`dismissErrorToast`, called automatically by `runAction`) clears it, and navigating away clears it. Never call `toast.error` directly, and never pop a dialog just to show an error.
- A delete that fails while its confirm dialog is open keeps the message inline in `ConfirmDestructive` (its `error` prop) so the answer sits next to the question. That confirm dialog is the **only** modal allowed to show a failure in its own body.
- **A failed save inside a create or settings modal reports through the error toast**, which draws above the modal; the modal stays open with the entered values intact. `useCreateContent`'s `setError` (`content-modal-shared.tsx`) is wired straight to `showErrorToast`, so every modal built on it inherits this — passing `null` clears the toast, which is what starting a new attempt does. There is no `ModalErrorBanner`; never re-add a red box inside a modal body.
- A failed **load** belongs to the surface that failed, not a toast: pass `error={{ message, onRetry }}` to `AdminTableShell` and the shared `ErrorBanner` (`src/components/ui/error-banner.tsx`) renders between the toolbar and the column headers, with the empty state beneath it. Non-table surfaces render `ErrorBanner` directly. Never draw a load error as red text inside the table body.
- Field validation reports on blur or submit with `aria-invalid` on the input — never per keystroke, and never a disabled button with no message.
- **A submit button is never greyed out because a field is empty** — only while the save is actually in flight (`disabled={saving}`), which means "busy", not "you're wrong". A button greyed for a validation reason is a dead end: it says no without saying why. Let the click happen and answer it with the error toast plus `aria-invalid`. This matches custom-shell, where every dialog button is disabled on the in-flight flag alone.
- **A modal never reports through a parent callback that feeds page state.** An `onError` prop wired to a page's `setError` paints the *load* banner on the surface behind the modal. Modals call `showErrorToast` themselves.
- **Do not rely on the browser's built-in `required` inside a tabbed modal.** Tab panels unmount when you switch away, so the browser refuses the submit with nothing on screen and the button looks dead. Validate in the handler, report through the error toast, set `aria-invalid` on the field, and switch back to the tab that holds it so the message points at something visible.
- Never expose stack traces, SQL, raw provider responses, or secrets.

## Success

- **Every create, edit and delete confirms with exactly one `showActionSuccess`.** A dialog that just closes is indistinguishable from a silent failure.
- Wording is a terse past-tense sentence naming the thing, capitalised, with a full stop: `Site created.` / `Contact updated.` / `Listings deleted.` Never prefix with "Successfully", and never carry an exclamation mark.
- Singular vs plural follows the count, and the count is captured **before** `clearSelection()` runs: `showActionSuccess(ids.length === 1 ? "Product deleted." : "Products deleted.")`.
- **One signal per action.** Toast at the layer that owns the server call, and nowhere else — if a modal toasts, its parent's `onSuccess` callback must not. Do not leave an inline "Saved!" label or green chip behind as a second confirmation.
- Shared controllers cover their whole family: `useContentListMutations` toasts create / update / duplicate / delete for posts, products, pages, events, listings and account pages using `itemLabel` / `itemLabelPlural`, so those screens must not toast again themselves.
- Bulk action buttons read `Verb (n)` — the shared `AdminBulkDeleteButton` reads `Delete (n)`; hand-rolled variants name their own verb (`Archive (n)`, `Remove (n)`).
- **How long a toast stays up is a setting, not a number in code.** Platform Settings → General has "Toast message duration (seconds)" (1–60, default 5, saved as `toast_seconds` in `admin_settings`). The root layout publishes it through `setToastSeconds` (`src/lib/toast-duration.ts`) and the Toaster subscribes with `useToastDurationMs`, so one number covers the admin and the public site. Never pass a `duration` to `toast.success` — `showActionSuccess` deliberately passes none. Failures are exempt: `showErrorToast` pins them with `duration: Infinity`.
- Error messages must never reveal another user's data (site names, emails, domains they own).

`runAction` accepts only `AdminActionResult`; callers must convert older result shapes at their action boundary.
