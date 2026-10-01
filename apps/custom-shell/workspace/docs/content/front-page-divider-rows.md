# The divider row

A divider is a front page row with no words in it. It marks the break between
the row above it and the row below it, and that is all it does. Add one from
Settings > Public Pages > Front page rows > Add row, the same as any other kind.

## The three things it can draw

The divider's own card has one choice, **What it draws**:

- **Line.** One thin rule across the row. It takes its colour from
  Settings > Styling > Divider lines, so it moves with every other rule on the
  site rather than staying put when that setting changes.
- **Dots.** Three small dots, in the same colour as the line and placed by the
  row's own Alignment. On a left-aligned site they sit on the left.
- **Space only.** Nothing is drawn. The row is there for the gap it adds, which
  is 32px on a phone and 64px on a larger screen, on top of the gap the page
  already puts between two rows.

A divider saved before this choice existed reads as Line.

## Its shade is its own

The divider's card has a **Shade** slider, 0 to 100, with a preview beside it
that changes as you drag. It is this row's own number. It does not read
Settings > Styling > Divider lines, so one break on the front page can be
stronger or fainter than the hairlines inside a card, and two dividers on the
same page can differ from each other. Tyler asked for this on 30 Sep 2026.

**10% is the default**, and it is exactly what the theme's own divider colour
is, so a divider left alone looks like every other line on the page.

The shade is a share of the page's own grey rather than a colour of its own, so
it still follows light and dark without anybody setting two values. A Space only
divider has no slider, because it draws nothing to shade.

## Making the line run the whole way across

A divider follows the same **Layout** choice as every other row, and by default
it sits in the public content column with the rest of them. On a 1440px window
that stops it 144px short on each side.

Set Layout to **Whole screen** and the line runs from one side of the window to
the other. A divider is the only row kind that reaches the edge exactly: every
other kind keeps the page's 16px edge so its words are never against the window.
[Layout](front-page-row-alignment-and-parts.md) has the rest.

## What a divider has, and what it does not

A divider still has Layout, Alignment, Shown on, and Hide this row from
visitors, because all four decide where the break sits and who sees it.

It has no Introduction, and no Show the heading or Show the introduction line
switches, because a divider draws neither.

**Its Heading box is labelled Name**, and the name only ever appears in the
rows list in Settings. It is how you tell one divider from another while
dragging them into order. A new divider is called "Divider" until you rename it,
so adding one takes one click and no typing.

## A divider never takes the page's main heading

The first front page row supplies the page's `h1`. A divider has no words, so
the count steps past it: a page that opens with a divider still puts its `h1` on
the first row that says something. Screen readers skip a divider entirely, since
the rows on either side of it are already separate sections.
