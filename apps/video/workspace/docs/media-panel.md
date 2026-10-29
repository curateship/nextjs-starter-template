# The Media panel

The editor's Media panel holds every file attached to the project. This doc
covers the filter menu and saved views, how files get in, and how they reach
the timeline. Collections, the named groups the filter can show, have their
own doc in [media-collections.md](media-collections.md).

## The filter menu

The funnel at the top of the panel, between search and +, opens one menu.
Tyler drew it on 29 Oct 2026, and it replaced the All / Video / Image / Sound
tabs and the row of collection chips that sat above the files.

- **Views** come first, once you have saved one. Clicking a view sets its
  types and collection. A tick marks the view that matches what is showing.
- **Type** has Video, Image and Sound buttons, and any number can be on.
  None on shows every type, the same as all three on.
- **Collection** lists All media, Uncollected and each collection, with a
  tick on the one showing. Uncollected only shows once a collection exists.
- **The number beside each row** is how many files picking that row would
  show in this project, with the types and search already applied. With
  Video and Sound on, All media counts only the videos and sounds.
- **+ New collection** opens the same window as the + menu's New collection.
- **Right-click** a view or a collection for Rename and Delete.
- **Clear filters** turns every type off and goes back to All media.
- **A dot on the funnel** says a type or a collection is picked.
- **The pick is not remembered.** Reopening the editor starts on every type
  and All media. A saved view is the way to get back to a pick.

The code is `MediaFilterMenu` in
`src/components/video-editor/studio-media-filter.tsx`. The carousel editor's
Image panel uses the same menu (see
[carousel-pictures.md](carousel-pictures.md)).

## Saved views

Save view at the foot of the menu names the pick and keeps it. Tyler chose on
29 Oct 2026 that a view is yours alone, shows in every project, and keeps the
types and the collection but not the search words.

- **Where they are kept:** the shell's `saved_views` table, the same one
  Viral's views use, under the screen key `editor-media:library`. The rules
  for what a view keeps are `mediaViewFilters` in
  `src/lib/video/media-saved-views.ts`, and the server registers them in
  `src/app/server-options.ts`. No migration was needed.
- **Nothing picked:** Save view says "Pick a type or a collection first, then
  save it as a view." A view of every type and All media would show the
  same as no view.
- **Its name** starts as what it shows, such as "Video, Sound · B-roll", and
  can be typed over.
- **A view whose collection was deleted** still opens. It shows All media
  with its types, and a message names the collection that went.
- **Limits** are the shell's: 30 views and a 60-character name.
- **A guest sent from Project** sees the Type row and Clear filters only. A
  guest has no collections and no views.

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
