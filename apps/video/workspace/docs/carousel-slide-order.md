# Carousel slide order and undo keys

Slides in the carousel editor can be dragged into a new order, and Cmd+Z and
Shift+Cmd+Z undo and redo.

## Dragging a slide

- **Where:** the Slides panel on the left of the carousel editor
  (`/admin/video-carousels`, open a carousel), in both the list and the
  thumbnail grid.
- **With a mouse:** press anywhere on a slide and drag it up or down. A press
  has to move 8 pixels before it counts as a drag, so a plain click still picks
  the slide.
- **With a finger:** drag by the six-dot grip. Anywhere else on a slide, a
  finger scrolls the list instead, so a phone can still scroll a long deck.
  In the grid the grip shows on hover, or once a slide has been tapped.
- **With the keyboard:** Tab to a slide's grip ("Move slide 3"), press Space,
  move it with the arrow keys, and press Space again to drop it. Escape puts it
  back. Space and Enter on the slide itself still pick it.
- **What stays picked:** the slide and layer that were picked before the drag,
  wherever the slide ends up.
- **Undo:** one drag is one undo step. Dropping a slide where it started adds
  no step.

The new order saves with the rest of the carousel a moment later, and the next
export's files follow it: the slide dragged to the top becomes
`slides/slide-01.png` (see [carousel-exports.md](carousel-exports.md)).

## Undo and redo keys

- **Cmd+Z** undoes the last change. **Shift+Cmd+Z** redoes it.
- **Control+Z does nothing here.** Tyler's own keyboard setup uses Control, and
  the video editor's keys were taken out for the same reason on 19 Oct 2026.
- **While typing** in any box, such as the caption or a text layer's words,
  the keys belong to that box and undo the typing, not the carousel.
- **While a window is open** (Preview, Export or Align all slides) the keys do
  nothing to the carousel.
- **After an undo** the first slide is picked, as with the undo button.

The keys run the same steps as the undo and redo buttons above the canvas, so
an undo saves the carousel the same way (see
[carousel-push-layout.md](carousel-push-layout.md)).

## Where it lives

`MOVE_SLIDE` in `builderReducer`, and `useSortableSlide`, in
`src/components/carousel-studio/carousel-studio.tsx`. The drag uses
`@dnd-kit/sortable`, the same library as the settings screens' menu editors.
