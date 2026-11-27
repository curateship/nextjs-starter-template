# Moving layers in the carousel editor

A dragged layer snaps into line with the slide and with other layers, the
arrow keys nudge it, every side and corner resizes it, and several layers can
be picked, moved, deleted and copied together.

## Snapping

- **Where it snaps:** the slide's left edge, centre and right edge, and its
  top, middle and bottom. Also any other layer's edges and middle.
- **Equal spacing:** a layer dragged between two others snaps where the gap
  on its left equals the gap on its right. A layer dragged beside a pair snaps
  at the same gap as the pair keeps. Only layers that sit level with it count,
  the way two cards side by side share some height.
- **How close:** 6 screen pixels, at any zoom, the same pull as the video
  stage.
- **What you see:** a thin line across the slide for each edge or middle it
  lined up with, and dashed marks along the equal gaps. They show while you
  drag and go when you let go.
- **Switching it off:** hold Alt while dragging, as on the video stage.
  Pressing Alt partway through a drag lets go of the snap straight away,
  without the pointer moving, and letting go of Alt snaps it again.
- **Hidden layers** are not snapped to.

The rule is `snapMove` and `snapResize` in `src/lib/video/carousel-snap.ts`.

## Resizing

A picked layer has eight handles: the four corners and the middle of each
side. A side handle moves only that side. A corner moves its two sides. The
opposite side stays where it was. The edge being dragged snaps to the same
lines as a move. No side passes the edge of the slide, and no layer gets
smaller than 6 out of 100 of the slide.

## Nudging

- **Arrow keys** move the picked layers one pixel at full size, 1080 wide.
- **Shift with an arrow** moves them ten pixels.
- **Each press** is one undo step.
- **Locked layers** do not move.
- **While typing** in a box, the arrow keys move the cursor instead.

## Picking several layers

- **Shift-click** a layer on the canvas or in the Layers list to add it.
  Shift-click a picked one to take it out.
- **A plain click** picks one layer on its own.
- **Dragging** any picked layer moves them all together. The group snaps as
  one box.
- **Delete or Backspace** removes every picked layer. Forward, Back and the
  bin in the inspector work on all of them.
- **The inspector** says how many are picked. It edits one layer's look at a
  time, so pick one on its own to change it.
- **Escape** clears the pick.

## Copy and paste

- **Cmd+C** copies the picked layers. **Cmd+V** pastes them onto whichever
  slide is picked at that moment.
- **Same place:** pasted layers sit where the copies were. When that would
  put them exactly on top of the originals, they land 20 pixels down and to
  the right, so the copy can be seen.
- **Pasted layers** arrive picked and unlocked.
- **The copy** lives in this window only. Words copied in a text box still use
  the system clipboard as usual.
- **A paste that would pass 50 layers** on the slide is refused with the
  usual message.

A drag, a paste and a group delete are each one undo step. A click that does
not move a layer adds no undo step. Before 21 Oct 2026 every click on a layer
added one.

The reducer actions are `UPDATE_ITEMS`, `PASTE_ITEMS`, `DELETE_ITEMS` and
`MOVE_LAYERS` in `src/components/carousel-studio/carousel-studio.tsx`.
