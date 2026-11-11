# No success toasts

Nothing pops up when something works. Tyler, 10 Nov 2026: "Remove all success
toast", then "All of trade and shell too", and on 11 Nov 2026 "remove success
toast across all these active apps".

- **What a person sees is the answer.** Archived projects leave the list, a removed team member leaves the table, a copied task opens.
- **Errors still pop up.** Anything that failed goes through `showErrorToast`
  (`src/lib/toast/error-toast.ts`) and stays until it is dismissed.
- **Part of it went, part of it did not: only the part that did not is said**,
  in the error toast. A bulk action where every row went says nothing.
- **Copy buttons say nothing when the copy worked.** A copy that failed still
  says so.
- **Undo stays.** Deleting a note or a task into the bin keeps its toast, because its Undo button is the only way back from there (`project-notes-panel.tsx`, `task-body.tsx`). Tyler decides whether these go too.

## Where it applies

- This app's own files, done 11 Nov 2026. The shell-origin screens (Admin,
  CRM, Automations, Settings) get it at the next shell merge; the shell made
  the change the same day.
- A new screen never adds a success toast. The UI standard
  (`.agents/skills/Ui-standards/SKILL.md`, Modals) says the same.
