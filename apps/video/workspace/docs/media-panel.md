# The Media panel

The editor's Media panel holds every file attached to the project. This doc
covers how files get in and how they reach the timeline. Collections, the
named groups the chips filter by, have their own doc in
[media-collections.md](media-collections.md).

## Getting a file in

The **+** at the top of the panel opens a menu with two choices:

- **Upload media** opens the file picker. Several files can be picked at once,
  and each is attached to the project as it finishes.
- **New collection** makes an empty collection. Filling it is the grid's
  Select flow, described in the collections doc.

The dashed "Drop or import media" box that shows while the project has no
files also opens the file picker when clicked.

## Only dragging puts a file on the timeline

Dragging a tile onto the timeline lands the clip where it is let go. A plain
click does nothing, so browsing the panel can never drop a clip into the edit
by accident. This replaced the old behaviour where a click added the file at
the playhead.

- **The code:** `useDragToTimeline` in
  `src/components/video-editor/use-drag-to-timeline.tsx`, shared with the AI
  clip panel. A press that moved less than 5 pixels counts as a click and is
  ignored.
- **Anywhere in the timeline counts.** Letting go on a lane lands it on that
  lane. Letting go on the ruler, the lane's left-hand buttons or the empty
  space under the last lane lands it on the nearest lane, at the time under
  the pointer. Letting go outside the timeline adds nothing.
- **Why the whole timeline:** until 20 Oct 2026 only the lane strips took a
  drop. A project with one lane is a 40 pixel strip over a lot of empty space,
  so a drop a little low added nothing and said nothing.
- **A video or sound file is measured first.** The browser opens the file just
  far enough to read how long it runs (`loadMediaDurationMs` in
  `src/lib/video/timeline-utils.ts`), and the clip lands once it knows. If the
  file will not open, or has not answered after 30 seconds, nothing lands and a
  message says so. Before 19 Oct 2026 a file that never answered left the drop
  waiting forever with nothing on screen.
- **Sound files too:** a sound card's play button previews it, and its name is
  just a name. Getting the sound into the edit is the same drag.
- **Right-click** on any tile still opens Collections and Delete.
