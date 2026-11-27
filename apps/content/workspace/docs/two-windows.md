# One project open in two windows

A project can be open in two windows at once, on one computer or on two. Only
one of them can save at a time, so the editor warns before that happens and
never throws away the work of the window that loses.

## Opening a project that is already being edited

The second window asks before any work is done in it.

- **What it says.** "This project is open in another window", with how long
  ago the other window opened it. The dialog is `open-elsewhere-dialog.tsx`.
- **How fast.** Measured on 24 Sep 2026 in a real browser, the dialog was on
  screen 1.6 to 1.8 seconds after the second window started loading. Most of
  that is the page loading. The check itself is one request.
- **Open read-only** is the button the dialog leads with. The window shows the
  project and saves nothing.
- **Edit here anyway** carries on as normal. Closing the dialog with Escape or
  the X means the same, because the person has been told.
- **Read-only windows do not count.** A project open read-only in one window
  opens normally in the next, with no dialog.
- **Reloading never counts.** A tab keeps its own id across a reload, so a
  reload never finds itself and calls it another window.

## What read-only means

- **The timeline cannot change.** Any change to a clip, a track, the shape or
  the undo history is refused, and the red toast says "This window is
  read-only, so that change was not made." with a Reload to edit button.
- **Looking still works.** Playing, scrubbing, selecting a clip, zooming and
  exporting all work. An export is made from the saved project, which is the
  other window's latest version, not necessarily what this window shows.
- **The AI tools do not open.** Every one of them ends by changing the
  timeline and most spend credits on the way, so they are stopped before they
  start rather than refused after the credits are gone
  (`studio-ai-panel.tsx`).
- **The project name can still be changed.** A name is saved on its own and
  never clashes with a timeline.
- **The lock button** sits beside the project name. It reads "Read-only.
  Reload to edit" when pointed at, and pressing it reloads. If the other
  window is still editing, the reload asks again.

## When both windows edit anyway

Every save carries the version it was built on, and the server refuses a save
built on a version somebody else has already moved past
(`writeProjectTimeline` in `src/server/video/projects.ts`). So whichever window
saves second is refused. Nothing is overwritten.

The refused window then does three things at once:

- **It stops saving for good.** A retry could never win, and the lock button
  changes to "Stopped saving. Reload to edit".
- **It keeps its work as a new project.** Everything it has on screen at that
  moment, including edits made while the refused save was on its way, becomes
  a new project named after the original with "(unsaved edits)" on the end. It
  goes in the original's folder, so the two sit side by side
  (`keepRefusedTimeline` in `src/server/video/projects.ts`).
- **It says where the work went.** The red toast reads "Another window saved
  this project first, so this one stopped saving. Your work here is kept as
  "My reel (unsaved edits)"." with an Open it button. Any later edit in that
  window is refused and repeats the same toast.

If keeping the copy fails, the toast says so and offers Try again. The work
stays on screen until it succeeds or the window is reloaded, and a reload at
that point loses it.

## What is kept and what is not

| | Kept |
| --- | --- |
| The window that saved first | Everything, as the project itself |
| The window that was refused | Everything it had on screen, as the "(unsaved edits)" project |
| Edits made in a read-only window | Nothing. They are refused as they are made |

Putting the two versions back together is done by hand: open the
"(unsaved edits)" project, copy the clips wanted, and paste them into the
original (`copy-clips-between-projects.md`).

## Merging is not built

Merging two timelines automatically was left out on purpose. The warning is
meant to make a clash rare, and whether it does is worth finding out from use
before building a merge. If merging is wanted later, it is its own task, and
the rule for what happens when both windows changed the same clip gets written
down before any merging code.

## How the editor knows about the other window

- **Each open editor writes a row** to `video_editor_windows` (migration 0089):
  the project, the window's id, whether it is editing or read-only, and when it
  opened. It writes again every 15 seconds while it is open.
- **A window that closes deletes its row**, including when the tab closes or
  reloads. That request is sent with `keepalive` so it still arrives from a
  page that is going away.
- **A row not written for 90 seconds counts as closed.** A browser slows a tab
  left in the background to about one timer a minute, and 90 seconds leaves
  room for that. A laptop shut mid-edit therefore still counts as open for up
  to 90 seconds.
- **Only the owner's rows are read or written.** The server checks the project
  belongs to the person asking before touching any row
  (`src/server/video/editor-windows.ts`).

## Not covered

- **Carousels** have their own editor and their own clash message. They still
  ask for a reload and do not keep a copy.
- **A tab copied with the browser's Duplicate command** gets its own id and
  counts as a second window, which is right. A tab whose browser blocks session
  storage makes a new id on every reload, so for up to 90 seconds after a
  reload it can warn about itself.
