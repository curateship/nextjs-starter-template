# Slide numbers

A slide-number layer shows "3/7", this slide's place and how many slides there
are. It works the number out on every draw, so dragging, adding or deleting a
slide never leaves it wrong. Tyler chose "3/7" only, with no dots and no swipe
arrow, on 20 Oct 2026.

- **Where:** the Text panel in the left rail, Slide number. "This slide" adds
  one to the picked slide. "Every slide" adds one to every slide that has none
  yet, as one undo step.
- **To start:** bottom right, Inter at 36, grey `#9ca3af` so it reads on dark
  and light slides alike.
- **Its look:** font, size, colour, alignment, and the Box and spacing card,
  the same as a text layer. It has no words of its own to edit.
- **Every slide again:** pressing it when every slide has one says so and
  changes nothing.
- **Align all slides** carries a slide number's place and look to the other
  slides' slide numbers, matched like text (see
  [carousel-push-layout.md](carousel-push-layout.md)).
- **The export** draws each slide's own number (`slideNumberText` in
  `src/lib/video/carousel-text.ts`).
- **Saved as** a layer of type `slide-number`.
