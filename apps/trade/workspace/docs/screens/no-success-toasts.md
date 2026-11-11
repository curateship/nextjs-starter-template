# No success toasts

Nothing pops up when something works. Tyler, 10 Nov 2026: "Remove all success
toast", then "All of trade and shell too".

- **What a person sees is the answer.** A saved setting stays as it was set, a
  new recipe opens its canvas, a deleted row leaves the table, an order shows
  in the bottom tables. A green "Saved" or "Created" on top of that says the
  same thing twice.
- **Errors still pop up.** Anything that failed, or did only part of what was
  asked, goes through `showErrorToast` (`src/lib/toast/error-toast.ts`) and
  stays until it is dismissed.
- **Part of it went, part of it did not: only the part that did not is said.**
  - Several rows deleted, archived or changed at once say nothing when all of
    them went. When some were refused, the error toast names how many went and
    how many were kept, from `describeBulkResult`.
  - A DCA ladder placed in full says nothing. One whose first rung could not
    buy yet, or whose rungs above the price were skipped, says so.
  - Clearing drawings names the trendlines kept back because a running grid
    uses them as its stop.
  - Moving a recipe's Markets step to another exchange says so only when it
    cleared the coins, because they have to be picked again.
  - Emptying a wallet that held nothing to sell says so.
- **Warnings stay.** A `toast.warning`, such as sounds switched on but the
  test sound refused by the browser, is not a success and is kept.

## Where it applies

- Trade's own files, done 10 Nov 2026. Shell-origin files in this app (the
  Admin, CRM, Automations and Settings screens) keep theirs until the shell
  makes the same change and it is merged in; that is the shell's task
  `no-success-toasts.md` in workspace-4.
- A new screen never adds a success toast. The UI standard
  (`.agents/skills/Ui-standards/SKILL.md`, Modals) says the same.
