# No success toasts

Nothing pops up when something works. Tyler, 10 Nov 2026: "Remove all success
toast", then "All of trade and shell too", and on 11 Nov 2026 "remove success
toast across all these active apps". Video, Promo and Viral each followed it,
and Content keeps all three.

- **What a person sees is the answer.**
  - In the editor, every action (captions, cuts, voiceovers, ads) shows on the
    timeline, where the editor's own Undo takes it back.
  - Phones, racks, keywords, accounts and queued checks change in their lists;
    a queued comment shows as waiting.
  - In Research, an added keyword shows in the list and starts searching;
    vault changes show on the ideas.
- **Errors still pop up.** Anything that failed goes through `showErrorToast`
  (`src/lib/toast/error-toast.ts`) and stays until it is dismissed.
- **Part of it went, part of it did not: only the part that did not is said**,
  in the error toast. A bulk action where every row went says nothing.
- **Copy buttons say nothing when the copy worked.** A copy that failed still
  says so.
- **Undo bars went too** (Tyler, 11 Nov 2026: "remove them"). An archive item
  is put back from the Bin, and a blocked subreddit is unblocked in Blocked
  subreddits.

## Where it applies

- All of Content's own files and the shell's screens (Admin, CRM,
  Automations, Settings).
- A new screen never adds a success toast. The UI standard
  (`.agents/skills/Ui-standards/SKILL.md`, Modals) says the same.
