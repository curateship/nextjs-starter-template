# No success toasts

Nothing pops up when something works. Tyler, 10 Nov 2026: "Remove all success
toast", then "All of trade and shell too", and on 11 Nov 2026 "remove success
toast across all these active apps".

- **What a person sees is the answer.** A follow moves the follower count, a cheer clears the picker, an admin bulk action changes the rows.
- **Errors still pop up.** Anything that failed goes through `showErrorToast`
  (`src/lib/toast/error-toast.ts`) and stays until it is dismissed.
- **Part of it went, part of it did not: only the part that did not is said**,
  in the error toast. A bulk action where every row went says nothing.
- **Copy buttons say nothing when the copy worked.** A copy that failed still
  says so.
- **Undo stays.** Archiving a project and binning uploads keep their toast, because its Undo or Bring back button is the way back (`projects-card.tsx`, `media-uploads-section.tsx`). Tyler decides whether these go too.
- **Notices about something that happened to you stay, as plain notices.** A room that ended under you, often by the host's hand, and a badge earned (`room-clock-store.ts`, `achievement-toast.tsx`). They are not a success message for something you pressed.
- **A button that had nothing to do says so plainly.** "All 20 are made already" and "There are no made-up members to remove" are plain notes in Settings → Simulated members.

## Where it applies

- This app's own files, done 11 Nov 2026. The shell-origin screens (Admin,
  CRM, Automations, Settings) get it at the next shell merge; the shell made
  the change the same day.
- A new screen never adds a success toast. The UI standard
  (`.agents/skills/Ui-standards/SKILL.md`, Modals) says the same.
