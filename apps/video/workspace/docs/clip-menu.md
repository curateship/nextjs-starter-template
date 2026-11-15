# The clip menu and deleting clips

Every clip on the timeline has the app's own right-click menu, and Delete
takes away every clip that is picked, not just the last one.

## The right-click menu

- **Every kind of clip gets it:** video, picture, sound, text, caption,
  shape, sticker and the rest, so no clip ever opens the browser's own Back,
  Reload and Inspect menu.
- **The first four rows are the same on every clip:** Copy, Paste at the
  playhead, Duplicate and Delete. When more applies to that kind, a line
  follows, then: Copy look and Paste look ([copy-a-clips-look.md](copy-a-clips-look.md)),
  Blur a spot ([blur.md](blur.md)), Remove reflection and Remove an object
  ([picture-clean-up.md](picture-clean-up.md)), Match the lips
  ([lip-sync.md](lip-sync.md)), Make it move ([animate-a-still.md](animate-a-still.md))
  and Make it again ([regenerate-a-scene.md](regenerate-a-scene.md)).
- **Copy and Delete act on the pick** when the clip right-clicked is part of
  it, the same rule Paste look follows. Choosing Copy or Delete on a clip
  that isn't picked picks that clip alone first, so the timeline and the
  inspector agree on what was acted on.
- **Paste** drops what was copied at the playhead, the same as Cmd+V
  ([copy-clips-between-projects.md](copy-clips-between-projects.md)).
- **Duplicate** puts a copy of this one clip straight after it, using the
  store's `DUPLICATE_CLIP`. A copy of an ad is an ad put by hand.
- **The History preview and other read-only views** have no Copy, Paste,
  Duplicate or Delete. A clip there gets a menu only when one of the AI rows
  applies.
- **The code:** `ClipContextMenu` in
  `src/components/video-editor/remake-clips.tsx`.

## Deleting the picked clips

- **Delete or Backspace, the toolbar's trash can and the menu's Delete** all
  remove every picked clip (Shift-click or Cmd-click to pick more than one).
  The toolbar's label says "Delete the selected clips".
- **One Undo brings them all back**, because they go as one step:
  `DELETE_CLIPS` in `src/components/video-editor/editor-store.ts`.
- **An ad** among them still closes the gap its pause made, as one ad taken
  off alone does.
- **While a thumbnail is being designed**, Delete and Backspace belong to the
  thumbnail's layers and leave the timeline alone, as before.
