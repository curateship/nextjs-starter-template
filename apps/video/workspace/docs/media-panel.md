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

Dragging a tile onto a track lands the clip where it is let go. A plain click
does nothing, so browsing the panel can never drop a clip into the edit by
accident. This replaced the old behaviour where a click added the file at the
playhead.

- **The code:** `tileUp` in
  `src/components/video-editor/studio-panels.tsx`. A press that moved less
  than 5 pixels counts as a click and is ignored.
- **Sound files too:** a sound card's play button previews it, and its name is
  just a name. Getting the sound into the edit is the same drag.
- **Right-click** on any tile still opens Collections and Delete.
