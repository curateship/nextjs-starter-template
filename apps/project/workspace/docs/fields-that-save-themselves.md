# Fields that save themselves

Some fields in Project have no Save button. They save when they are left or
picked, and each one shows the same small sign beside it while it does:
Saving…, then Saved, or Not saved in red when the server refused. A refusal
also shows the reason in the error toast, and the field keeps what was typed.

It is one sign everywhere so nobody has to wonder whether a field saved. These
fields don't toast on success, because a toast for every field left would be
noise.

## Where it shows

- **Job title**, beside its label: on My dashboard and in a teammate's window
  on the Members page.
- **My check-in time**, beside the section's heading, for the time and the
  time zone together, and for "Use the team's time".
- **Team settings**, at the top of the window beside "Changes save as you
  make them.", for the name, check-in time, time zone and work days.
- **Notes for the team** in the check-in window, in the card's header, once
  checked in.

## Why not the page header

The shell's Settings pages put Saving… in the sticky header
(`useReportedSaveStatus`). Most of these fields sit inside a window, where the
header is behind the dimmed backdrop, so the sign sits beside the field.

## Where it lives

- **The save and its state:** `useSaveLine` in
  `src/lib/project/use-save-line.ts`.
- **The words on screen:** `SaveLine` in
  `src/components/project/save-line.tsx`.
