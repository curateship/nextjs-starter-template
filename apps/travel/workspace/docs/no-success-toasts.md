# No success toasts

Nothing pops up when something works. Tyler, 10 Nov 2026: "Remove all success
toast", then "All of trade and shell too", and on 11 Nov 2026 "remove success
toast across all these active apps".

- **What a person sees is the answer.** A new activity opens in the right panel, deleted trips leave the table, archived trips move tabs.
- **Errors still pop up.** Anything that failed goes through `showErrorToast`
  (`src/lib/toast/error-toast.ts`) and stays until it is dismissed.
- **Part of it went, part of it did not: only the part that did not is said**,
  in the error toast. A bulk action where every row went says nothing.
- **Copy buttons say nothing when the copy worked.** A copy that failed still
  says so.
- **Undo bars went too** (Tyler, 11 Nov 2026: "remove them"). A deleted card, note or trip waits in its bin, which is the way back; a moved card is moved back by hand.

## Where it applies

- This app's own files, done 11 Nov 2026. The shell-origin screens (Admin,
  CRM, Automations, Settings) get it at the next shell merge; the shell made
  the change the same day.
- A new screen never adds a success toast. The UI standard
  (`.agents/skills/Ui-standards/SKILL.md`, Modals) says the same.
