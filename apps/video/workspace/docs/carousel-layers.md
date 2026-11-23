# The Layers list

The Layers button in the carousel editor's left rail lists every layer on the
picked slide, the top one first. A layer can be picked, hidden or locked there.

- **Names:** a text layer by its first words. A picture by its file name. A
  slide number, a shadow or a video by what it is.
- **Picking:** a click picks the layer. Shift-click adds it to the picked
  ones, as on the canvas (see [carousel-snapping.md](carousel-snapping.md)).
- **Hide (the eye):** a hidden layer is not drawn on the canvas, in the slide
  thumbnails, in the preview or in the export. It stays in the list, greyed,
  so it can be shown again.
- **Lock (the padlock):** a locked layer cannot be dragged, resized or nudged
  on the canvas. A press goes through it to the layer underneath, so a locked
  background photo never moves by mistake. Pick it from this list to change it
  in the inspector.
- **Undo:** hiding, showing, locking and unlocking are each one undo step.
- **Pasted layers** arrive unlocked.
- **Saved as** `hidden: true` and `locked: true` on the layer. Missing means
  shown and unlocked.

The list is `LayersPanelBody` in
`src/components/carousel-studio/layers-panel.tsx`.
