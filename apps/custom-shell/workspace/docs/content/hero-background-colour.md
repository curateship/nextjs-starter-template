# A hero's background colour

A hero row can carry its own colour, painted as a band behind it. Set it in
Settings > Public Pages > Front page rows, open a hero, and use **Background
colour** in the Row content card. Leave the box empty and the row shows the
page's own colour, which is what every hero saved before this did.

Only a hero has the setting. The other kinds of row sit on the page's colour.

## What the band covers

The band runs right across the window, both edges, whatever the row's **Layout**
says. A Narrow hero keeps its words in a 768px column and still sits on a colour
that reaches the window, because a colour stopping 144px short of each side
reads as a mistake rather than a choice.

A row with a colour also gets its own padding above and below its words, 48px on
a phone and 64px on a desktop, so the heading is never against the top edge of
its own colour. A row with no colour needs none: the gap between two rows is
already its breathing room.

## Running the colour under the menu

The switch underneath, **Run the colour under the menu**, starts the band at the
very top of the window instead of under the menu bar. The page then opens on one
band of colour rather than a white strip above a coloured one.

**The menu bar stops painting its own background** while this is on, so the
colour behind it is the colour you see. It keeps its blur, its border and
everything in it. Without this the bar draws its own near-solid white and the
colour stops dead at the bottom of the menu.

Once you scroll past the hero there is no colour behind the bar any more, only
the page, so a sticky menu goes from your colour to blurred page content as it
leaves the hero.

**Only the top row of the page can do it.** The menu sits over the first row and
nothing else on the page is near it, so the switch is greyed out on any hero
that is not first, with the reason written beside it. Drag the row to the top of
the list and the switch comes back. The switch is also greyed out until the row
has a colour.

The footer keeps whatever colour Settings > Styling gave it. A hero at the top
of the page says nothing about the bottom of it.

## Two things worth knowing

**The colour is one colour, not two.** It is the same in light mode and dark
mode, the same as a custom colour anywhere else in Styling. Pick one that your
heading can be read on in both.

**The band has to know how tall the menu bar is**, since it starts above its own
row. The bar measures itself and writes the number down as
`--shell-public-header-height`, and watches for the bar growing a line taller
when the window narrows. Without JavaScript the colour simply starts under the
bar instead of behind it.

## What gets stored

Two fields on the hero row, in the same settings row that already holds every
front page row. Nothing new in the database, so there is no migration.

- `background` is a 6-digit hex code, `#0f172a` and the like, or empty.
- `backgroundUnderMenu` is on or off.

Anything that is not 6 hex digits is refused when you save and dropped when the
page is read, so a colour name, a `var(...)` or anything else that would reach a
visitor's browser as a piece of CSS never gets stored. The field writes a colour
into every visitor's page, so it takes colours and nothing else.
