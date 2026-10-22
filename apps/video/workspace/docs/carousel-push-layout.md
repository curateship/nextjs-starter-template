# Align all slides: one slide's layout across a carousel

Set up one slide the way you want it, then push its layout onto some or all of
the other slides. A headline placed once sits in the same place on all ten
slides, and every slide keeps its own words and pictures.

## Where it is

In the carousel editor (`/admin/video-carousels`, open a carousel), pick the
slide to copy and click the grey space around it so no layer is picked. The
Slide card in the right panel then has a "This slide's layout" row with a
"Align all slides" button. The row is hidden when the carousel has only one
slide.

The button opens a window listing every other slide, all ticked to start. Each
row says how many of that slide's layers will change, such as "1 of 3 layers
change", or "No layers like this slide's" when nothing on it matches. Untick
the slides to leave alone, then press "Align 3 slides".

## What travels and what never does

A pushed layout carries where each layer sits and how it looks. It never
carries what the layer says or shows. This is the part that is easy to get
wrong, so here it is layer by layer.

| Layer | Copied from the source slide | Never touched |
| --- | --- | --- |
| Text | Position, size, font, font size, colour, alignment, line and letter spacing, the box behind the words, the outline, the highlight colour | The words, and which of them are bold or highlighted |
| Slide number | Position, size, and the same look as text | Nothing else exists on a slide number |
| Picture or video | Position, size, Fit (Fill, Cover or Contain) | Which picture it is, its description, which part of it a crop shows |
| Shadow | Position, size, colour, strength, direction | Nothing else exists on a shadow |

Three things never change on any slide:

- **The slide's background colour.** A deck that alternates dark and light
  slides stays that way. Tyler's call, 19 Oct 2026.
- **The order layers stack in.** Each layer keeps its own place in the stack,
  so a picture that sat behind a text box still does.
- **The source slide itself.** Pushing reads it and never writes to it.

Fit travels with the box because a picture moved into the source's box should
crop the way the source's picture does. Tyler's call, 19 Oct 2026.

## How layers are matched

Slides rarely have the same layers, so each layer on a target slide looks for a
partner of the same kind on the source slide. The four kinds are text, slide
numbers, pictures (images and videos together) and shadows.

- **Within a kind, the bottom one matches the bottom one.** The lowest text on
  the target takes the lowest text on the source, the next text up takes the
  next one up, and so on. Two layers stacked at the same level keep the order
  they were added in.
- **A layer with no partner is left exactly as it was.** A source with two text
  boxes and a target with three changes the target's lower two and leaves the
  third alone.
- **A missing kind is skipped, never added.** A target with only text gets its
  text moved and gains no picture or shadow. Pushing never adds or removes a
  layer.

The rule is `matchSlideLayers` and `pushSlideLayout` in
`src/lib/video/carousel-layout.ts`.

## One undo puts it all back

The whole push is one step in the editor's undo history. One press of Undo puts
every slide back the way it was before the push, and Redo pushes it again. A
push that changes nothing, because none of the picked slides has a matching
layer, adds no step to undo and says so in an error message.

Undo also saves. A carousel saves itself a little after every change, and Undo
back to the version the editor opened on now saves that version too. Before
19 Oct 2026 the editor skipped that save, so the slides on screen went back
while the saved carousel kept the pushed layout.

## Text that no longer fits

A pushed text box can be smaller than the one it replaces, so a long paragraph
can end up in a box sized for a short headline. When that happens the message
after the push names each slide, such as `3 slides aligned to this one. Text does
not fit its box on slide 6 "Long read", so the export would cut it off.`

The usual warning marks stay as well: a mark beside the slide's number in the
left Slides list and a "Text that does not fit" card on that slide. Both are
described in [carousel-shapes.md](carousel-shapes.md). Text is never made
smaller to fit. Make the box taller or the words smaller by hand.

## Picking slides

- **All or some.** "All other slides" ticks or unticks every row at once, and
  shows a dash when only some are ticked. A selection of three changes exactly
  those three.
- **Nothing ticked.** The button stays pressable. Pressing it keeps the window
  open and says "Pick at least one slide to line up with this one."
