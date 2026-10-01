# Alignment and parts of a front page row

Every front page row answers two questions of its own: where it sits across the
page, and which of its parts a visitor sees. Both are in the row window in
Settings > Public Pages > Front page rows.

## Layout: how wide the row is

**Layout** offers three widths, and the difference between the first and the
third is the one worth knowing.

- **Full width** is the default and where every row sits unless it is told
  otherwise. It is the full width of the public content column, which is capped
  at 1152px and centred. On a 1440px window that leaves 144px of empty page on
  each side.
- **Narrow** caps the row at 768px inside that same column.
- **Whole screen** steps the row outside the column and outside the page's own
  left and right edge, so it runs from one side of the window to the other. On
  a 1440px window the row is 1440px.

A row set to Whole screen puts the page's 16px edge back as padding, because a
heading that runs the whole way across a wide window is not readable. A divider
is the exception: it has no words, so its line really does run from edge to
edge.

Nothing saved before Whole screen existed moves. A row has to be set to it one
at a time.

**How the step out works**, since the class looks odd otherwise: the content
column is centred inside `<main>`, so half the window less half the column is
exactly the distance to each edge, which is what `mx-[calc(50%-50vw)]` is. The
`<main>` element carries `overflow-x-clip` so the window never gains a sideways
scrollbar, because `100vw` counts the vertical scrollbar and the row is a few
pixels wider than the space there is. `clip` rather than `hidden`, because
`hidden` would make `<main>` a scroll container and break sticky children.

## Alignment: one row can ignore the site setting

**Alignment** offers Follow the site, Left, Centred and Right. Follow the site
is the default, and it is what every row saved before this choice existed reads
as.

Follow the site means the row reads Settings > Styling > Page frame > Content
alignment, the app-wide choice that moves all public content at once. The other
three override it for that one row, so a centred site can still have a
left-aligned FAQ, or a left-aligned site one centred hero.

A row that sets its own alignment has to do two things, which is why the code
looks the way it does:

- **Place itself in the column.** The public content column sets
  `justify-items`, so the row also needs `justify-self` or the column decides
  where it sits.
- **Line up its own children.** A row that follows the site reads the alignment
  off the content column with `group-data` classes. A row with its own
  alignment cannot, because both values would then match and neither would
  reliably win, so `FrontPageRows` hands each block a plain class instead.

The row carries `data-front-page-alignment` in the page source, so the chosen
value can be read straight off a rendered page.

## The row window's cards

The row window is three cards in a fixed order: **Row content** at the top,
then the card for the row's own kind (Hero, Testimonials, FAQ entries, Logos,
Screenshots), then **Visibility** at the bottom. Visibility is last because it
switches off parts that are set in the two cards above it, so it reads in the
order the work is done.

**Every card folds away.** Clicking a card's heading collapses it, and this
browser remembers which cards are folded, the same as the cards on the settings
page itself. Folding a card does not lose anything typed into it: what the
window holds lives in the window, not in the card.

## Visibility: which parts are drawn

The **Visibility** card holds every on-or-off choice for the row. The first
switch is **Hide this row from visitors**, which has its own doc:
[Hiding a row, and choosing its screens](showing-and-hiding-public-things.md).
The rest switch off one part of the row and leave the rest alone.

Every row has:

- **Show the heading.** A row still needs a heading to save, because the editor
  lists rows by it and the first row supplies the page's main heading.
- **Show the introduction line.**

A hero row adds the picture, the button or email box, the stars and the line
under the button. Testimonials add each person's picture and role. FAQ adds the
Q1, Q2 numbering. Screenshots add the captions.

**Switching the heading off on the first row leaves the page without a main
heading.** The first row is what supplies the page's `h1`, the one line a
search engine reads as the page's title, and no other row takes the job over.
Switch it off on a row further down, or leave the first row's heading on.

**Switching a part off keeps what was typed into it.** The words and the chosen
picture stay saved, so switching the part back on brings the same content back.
Nothing is deleted.

**A switched-off part is left out of the page, not hidden with a class.** The
hero's picture is the one worth naming: with it off the words run across the
page exactly as they do for a hero that never had a picture, and the file is
not preloaded either.

The one exception is a screenshot caption, which is also that picture's alt
text. With captions off the caption is still in the `alt` attribute, because a
picture with no alt text is a picture a screen reader cannot describe.

## Where it lives

- `lib/pages/front-page.ts` — `alignment` and the ten `show*` fields on a row,
  their choices and labels, and the normalizer. Only an explicit `false`
  switches a part off, so an older row keeps showing everything.
- `components/shell/public-content-alignment.ts` —
  `publicContentAlignmentSelfClassNames`, the classes a row uses when it sets
  its own alignment.
- `components/marketing/front-page-rows.tsx` — works out the row's alignment
  class and passes it, and each visibility flag, to the blocks.
- `components/marketing/front-page-content-blocks.tsx` — each block draws or
  skips its own parts.
- `components/settings/front-page-row-dialog.tsx` — the Alignment select and
  the Visibility card.
- `components/settings/front-page-row-content-editor.tsx` — the card for each
  row kind. Its `EditorCard` is a `CollapsibleSettingsCard`, which is where the
  folding and the remembered choice come from.
- `components/settings/front-page-rows-settings.tsx` — the list of rows. The
  hover tint is on the whole list row, so pointing at the drag handle or the
  icons at the end lights the same strip as pointing at the words.
- `lib/api/shell-settings.ts` — the save schema. A field missing from
  `frontPageRowBaseShape` is dropped on the way to the database, however well
  the editor and the public page handle it, so every new row field belongs
  there as well. The new ones are defaulted, so a settings tab left open from
  before they existed still saves.
