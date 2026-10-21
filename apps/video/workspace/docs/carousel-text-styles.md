# Text styles on carousel slides

Words on a slide can be bold or highlighted one word at a time. A text box can
have its own line and letter spacing, a coloured box behind it, and an outline
round its letters. The export draws all of these where the canvas does.

## Bold and highlighted words

- **Where:** pick a text layer. In the Text card, select words in Content,
  then press Bold or Highlight under Words. Tyler chose select-then-press on
  20 Oct 2026, so no markup is typed into the words.
- **Taking it off:** select the same words and press the button again. A
  button shows as pressed when every selected letter already has that style.
- **Nothing selected:** the button says to select the words first.
- **A highlight** is a coloured box behind the words, yellow to start. Its
  colour is the Highlight colour row, which shows once anything is
  highlighted. Tyler picked a box over a second text colour or an underline.
- **Editing the words** moves the styles with them. Letters typed inside a
  bold word are bold. Letters typed just before or just after it are not.
  Deleting styled
  letters takes their style with them.
- **Saved as** `marks` on the layer: the first and last letter of each styled
  stretch and its style. `highlightColor` holds the colour.

## Why bold is an outline

Every face ships at one weight, 600, both in the browser and in the server's
font files (`src/lib/video/text-fonts.ts`). True bold would mean a second font
file per face. Bold is drawn instead as a line round each letter in the
letter's own colour, 4.5 out of 100 of the font size wide. The canvas uses
`-webkit-text-stroke` and the export uses an SVG stroke, so the two match.

## Box and spacing

A card under Text, also on slide numbers.

- **Line spacing:** 80 to 240 out of 100 of the font size, 116 to start.
- **Letter spacing:** from -10 to 50 out of 100 of the font size, added after
  each letter. Wider spacing makes lines wrap sooner, and the "does not fit"
  check counts it.
- **Box behind the words:** a switch, then a colour. It fills the whole layer
  behind its words.
- **Outline round the letters:** a switch, then a colour and a width from 1 to
  24 pixels at full size. The outline sits under the letters, so it never
  thins them.

## How the export matches the canvas

- **Lines** break by the words' real width in the face, measured by resvg, as
  the browser breaks them on the canvas (`wrapCarouselRuns` in
  `src/lib/video/carousel-text.ts`). Before 21 Oct 2026 they broke by a count
  of letters at the face's average width, so wide capitals ran past the box
  and were cut off: "WHY MOST BRANDS" at Inter 96 in an 864px box is about
  975px wide.
- **The "does not fit" mark** still counts letters at the average width, so
  a box of wide capitals can wrap onto one more line in the export than the
  mark expects.
- **Where a line sits:** a browser centres a face's height on each line. The
  export now does the same from each face's ascent and descent, read from its
  ttf. Before 21 Oct 2026 the export put the first line one font size down,
  which at default spacing was 5 to 6 pixels lower than the canvas for Inter
  at 96px, and much further off at wider spacing.
- **Centred and right-aligned lines** are placed by their measured width.
  resvg measures each run (`measureAdvance` in
  `src/server/video/carousel-export.ts`), so a highlight's box sits under
  exactly its words.
- **Drawing order**, bottom first: the box behind the words, the highlight
  boxes, the outline, the letters. A highlight reaches 8 out of 100 of the
  font size past its words, and may reach past the layer's edge, as on the
  canvas.

## The text presets

The Text panel's presets used to show Headline and Title in weight 800 and Pull
quote in italic. The export draws every face at 600 and upright, so what came
out did not match what was picked. The presets now show the face and weight
they export in. Pull quote is set in Playfair Display, so it still looks
different from a headline.
