# Carousel shapes

A carousel can be 4:5 (a feed post), 1:1 (square) or 9:16 (a story). Changing
the shape moves the layers to suit the new frame instead of stretching them,
and a copy in another shape leaves the original untouched.

## Where it is

Both controls are in the carousel editor (`/admin/video-carousels`, open a
carousel).

- **The Format switch.** 4:5, 1:1 and 9:16 sit on the canvas, top right, just
  left of the zoom control. They change this carousel's shape in place. One
  Undo puts the whole deck back the way it was. Tyler moved it there from the
  Slide card on 19 Oct 2026.
- **Make a copy in.** Two buttons in the Slide card of the right panel, shown
  when no layer is picked, one for each other shape. They save the carousel,
  make a new one named after it with the shape added ("test 9:16"), and open
  it. The original is not changed.

## Why a copy is the main way

The relayout follows a fixed rule and cannot know what a layer is for, so some
slides will need fixing by hand afterwards. A copy keeps the original safe
while that happens, and a feed post and its story version are usually both
wanted. The Format switch stays because a new carousel always starts 4:5 and
there has to be a way to start one in another shape. Both use the same rule,
in `src/lib/video/carousel-layout.ts`. Tyler chose this on 19 Oct 2026.

## The relayout rule

Every shape is 1080 pixels wide. A 4:5 slide is 1080 by 1350, a square is
1080 by 1080 and a story is 1080 by 1920. Only the height changes, so the
frame's shorter side is always its width, and keeping a layer's size against
the shorter side means keeping its size in pixels.

- **Sideways, nothing moves.** A layer keeps its left edge and its width, so
  text wraps at the same words as before.
- **Its height in pixels stays the same.** A logo 170 by 95 in a 4:5 slide is
  still 170 by 95 in a story. A circle stays a circle.
- **A layer in the middle keeps its centre.** A layer whose middle sat 40 out
  of 100 of the way down the slide still sits 40 out of 100 of the way down.
- **A layer touching the top or the bottom stays against it.** A Bottom fade
  567 tall still sits on the bottom edge of the story. Tyler's call,
  19 Oct 2026, so a fade never ends short of the edge.
- **A layer touching both the top and the bottom keeps doing so.** A
  background photo or a Full scrim that covers the slide covers the new slide
  too. A photo set to Fill crops differently rather than stretching. Tyler's
  call, 19 Oct 2026.
- **A layer pushed off the slide moves back on.** Going from a story to a
  square, a layer near the top keeps its centre and would poke out, so it
  slides down until its top edge is on the slide.

Touching an edge means within 2 out of 1000 of it, about 3 pixels, because a
layer dragged to the edge is saved a hair short of it.

## What it will not fix

- **A layer taller than the new slide shrinks.** Going from a story to a
  square, a picture 1500 tall cannot fit in 1080. It shrinks evenly to 1080
  tall around its centre, so it keeps its proportions. A text box keeps its
  width and is cut to the slide's height, so its words wrap as before.
- **A layer too short for the new slide grows a little.** The saved slides
  allow no layer shorter than 5 out of 100 of the slide's height, which is 96
  pixels in a story. A 60-pixel logo from a square grows evenly to 96. A text
  box only grows taller, which gives its words more room.
- **Nothing is rearranged.** Layers are not spread out to use the extra height
  of a story, and they are not packed closer in a square. A deck built for a
  square will have empty space at the top and bottom of a story.
- **Text is never made smaller.** A box that got shorter keeps the same font
  size and is flagged instead.

## Text that does not fit

Because every shape is 1080 wide and a text box keeps its width, a resize never
changes where a line wraps. Text stops fitting only when a box is cut to the
height of a shorter slide, such as a 1300-tall block of text going from a story
to a square.

The export draws each text box's words line by line and cuts off any line that
runs past the bottom of the box. The editor works out the same lines the export
does, from each face's letter width in `src/lib/video/text-fonts.ts`, and
flags every text box whose lines are taller than the box.

- **In the left Slides list**, a warning mark sits beside the number of every
  slide with text that does not fit, and the slide's button says so to a
  screen reader.
- **In the right panel**, a "Text that does not fit" card above the Slide card
  lists each text box on that slide by its first words. Clicking one picks it.
- **With the text box picked**, the Text card says the words run past the box.

The flag is worked out afresh on every edit, so it goes as soon as the box is
made taller or the words smaller. It is not only about resizing: text that
never fitted is flagged too, because the export cuts it off just the same.

The editor's canvas wraps lines with the browser's own measurements while the
export guesses from an average letter width that is set a little wide on
purpose. The flag follows the export, because the export is what gets posted,
so a box can be flagged while the canvas still shows every word.
