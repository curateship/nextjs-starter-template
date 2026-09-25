# The brand kit in carousels

Carousels use the same brand kit as videos: the saved colours, the logo, the
watermark's corner and size, and the four fonts. Everything else about a slide
is still set on the slide itself.

## What carousels take from the kit

- **The Brand panel.** The fifth button on the carousel studio's left rail. It
  shows the kit's colours, the logo, a Place logo button and Edit brand kit,
  which opens the same window the video editor's Brand panel opens.
- **One press colours whatever the inspector is showing.** With a text layer
  selected, a colour goes on the words. With a shadow selected, it goes on the
  shadow. With nothing selected, it goes on the slide's background. A picture
  cannot take a colour, so pressing one then shows a message and changes
  nothing.
- **Each press is one undo step.** Undo puts back the colour from before the
  press.
- **Every colour picker offers the kit's colours first.** Those pickers are the
  slide's Background, the text layer's Colour, the shadow layer's Colour and
  the Shadow panel's Tint. The built-in swatches follow, minus any the kit
  already has. Hovering a kit swatch shows its name and value, such as
  "Accent · #22c55e".
- **Place logo puts the logo on the slide as an ordinary picture layer.** It
  lands in the watermark's corner at the watermark's width, with the same gap
  from the edge the video export leaves: 43 pixels on a 1080-pixel-wide slide.
  It keeps the logo's own shape and sits above every layer already on the
  slide. From then on it moves, resizes and deletes like any other picture.
- **A placed logo is a copy, not a link.** Changing the kit's logo later leaves
  logos already on slides as they were.
- **The fonts come for free.** Carousel text chooses from the same list as
  video text, `TEXT_FONTS` in `src/lib/video/text-fonts.ts`.
  `src/lib/video/carousel-schema.ts` builds its list of allowed fonts from that
  same list. The export's font files in `src/server/video/text-font-files.ts`
  are keyed by the same ids, so a new font missing its server file fails the
  type check instead of drawing blank words.

## What carousels still set for themselves

- **Slide size, text size, alignment and layer order.** The kit has nothing to
  say about any of them.
- **The kit's caption look, end card, loudness and watermark switch.** Those
  belong to video exports. A slide never gets a logo it was not given. The
  watermark's corner and width only decide where Place logo puts it.
- **The watermark's opacity.** A placed logo is fully solid, because a picture
  layer on a slide has no opacity setting.

## Edge cases

- **Short colours.** The kit accepts `#fff`, but a slide only saves six-digit
  colours. The studio writes every kit colour out in full (`#ffffff`) before a
  slide can use it. `sixDigitBrandColor` in `src/lib/video/brand-kit.ts` does
  that.
- **The same colour twice.** Colours with the same value show once, under the
  first one's name.
- **No colours or no logo.** The panel says "No brand colours yet" or "No logo
  yet". Edit brand kit is always there to add them.
- **A logo that is not in the media library.** A slide can only show a picture
  from the library. When the kit's logo lives at some other address, pressing
  Place logo shows a message asking for the logo to be picked again in Edit
  brand kit, and nothing is placed.
- **Somebody else's logo.** A slide may show the person's own pictures, and the
  kit's logo whoever uploaded it, since the kit belongs to the whole app. That
  rule is `findSlidePicture` in `src/server/video/carousel-export.ts`. Once an
  admin changes the kit's logo, the old logo stops counting. A slide that still
  holds it then fails to export with "A slide image is no longer in the media
  library", unless the old logo is the person's own upload.

## The export matches the screen

Brand colours reach the export as plain colour values, the same ones the
canvas draws. The logo is drawn by the picture path every other picture uses,
fitted without cropping (`xMidYMid meet`, which is `object-contain` on the
canvas). The logo's box is the logo's own shape, so the fit leaves no bars.

Checked on 25 Sep 2026 with an SVG logo in the bottom-right corner of a 4:5
slide. The logo's edges on the export were within one pixel of the canvas on a
1080-pixel-wide slide. The background and the shadow came out as the same
colour values in both.
