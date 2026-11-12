# No success toasts

Nothing pops up when something works. Tyler, 10 Nov 2026: "Remove all success
toast", then "All of trade and shell too", and on 11 Nov 2026 "remove success
toast across all these active apps".

- **What a person sees is the answer.** Every editor action (captions, cuts, voiceovers, ads) shows on the timeline, where the editor's own Undo takes it back.
- **Errors still pop up.** Anything that failed goes through `showErrorToast`
  (`src/lib/toast/error-toast.ts`) and stays until it is dismissed.
- **Part of it went, part of it did not: only the part that did not is said**,
  in the error toast. A bulk action where every row went says nothing.
- **Copy buttons say nothing when the copy worked.** A copy that failed still
  says so.
## Where it applies

- This app's own files and the shell's screens (Admin, CRM, Automations,
  Settings), done 11 Nov 2026; the shell's arrived with that day's shell
  merge.
- A new screen never adds a success toast. The UI standard
  (`.agents/skills/Ui-standards/SKILL.md`, Modals) says the same.
