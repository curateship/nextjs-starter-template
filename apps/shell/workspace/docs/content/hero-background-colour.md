# A hero's background colour

A hero row can carry its own colour, painted as a band behind it. Open the front
page editor at Pages > Home, click a hero, and use **Background colour** in the
Block content card, under Alignment, with the switch beneath it.
Pick **No colour** and the row shows the page's own colour, which is what every
hero saved before this did.

Only a hero has the setting. The other kinds of row sit on the page's colour.

## Two kinds of background

**Muted grey** is a slider. Drag it and the band steps away from the page: all
the way left it is barely off the page, all the way right it is a clear band.
The slider sets both modes at once, so the same drag darkens the band in light
mode and lightens it in dark mode. Under the slider sit two swatches, the light
band on the left and the dark band on the right, redrawing as you drag, because
the one you are not looking at is the one that usually goes wrong.

Even at the right-hand end the band stays close to the site's own grey, so a
heading in the normal text colour reads on it in either mode.

**Fixed colour** is the colour square and the hex box. A hex code is one colour
by definition, so it is the same in light mode and dark mode, and a pale one
will glare on a dark page. Use the grey if you want dark mode handled for you.

## What the band covers

The band runs right across the window, both edges, whatever the row's **Layout**
says. A Narrow hero keeps its words in a 768px column and still sits on a colour
that reaches the window, because a colour stopping 144px short of each side
reads as a mistake rather than a choice.

## The hero's own air

**Space above and below** in the Hero card, 0 to 240px, is the air the hero
keeps top and bottom. 64px is the default and a phone draws 75% of whatever
you set, so the default is 48px on a phone, which is exactly what a hero drew
before the slider existed. Nothing moves on a page saved earlier.

It is the hero's own number, one per row, so a hero at the top of the page can
breathe more than one halfway down. With a colour, that air sits inside the
band and is what stops the heading against the top edge of its own colour.
Without one, it is what stops the heading against the menu bar.

Two other numbers look similar and are not this one:

- **Settings > Styling > Main spacing** does not touch the front page at all,
  which is why the hero needs a number of its own.
- **Space between rows** is the gap between two blocks. It sits outside a
  hero's background colour; this sits inside it.

Every other kind of row still takes its breathing room from the gap between
rows.

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

**The band has to know how tall the menu bar is**, since it starts above its own
row. The bar measures itself and writes the number down as
`--shell-public-header-height`, and watches for the bar growing a line taller
when the window narrows. Without JavaScript the colour simply starts under the
bar instead of behind it.

## What gets stored

Two fields on the hero row, in the same settings row that already holds every
front page row. Nothing new in the database, so there is no migration.

- `background` is `grey-<n>` with n from 0 to 100, a 6-digit hex code such as
  `#0f172a`, or empty.
- `backgroundUnderMenu` is on or off.

Anything else is refused when you save and dropped when the page is read, so a
colour name, a `var(...)` or anything else that would reach a visitor's browser
as a piece of CSS never gets stored. The field writes a colour into every
visitor's page, so it takes those two shapes and nothing else.

The slider's number is stored as the number, never as the CSS it becomes.
`frontPageHeroBandColors` in `src/lib/pages/front-page.ts` turns it into the
two `oklch` colours, so the text a visitor's browser reads is written in the
repo rather than in a settings field.

## How two colours fit in one band

An inline `background-color` is one colour and cannot change when the page
turns dark. So the band carries both: `--shell-hero-band-light` and
`--shell-hero-band-dark`, set on the element, and two rules at the end of
`src/theme.css` pick between them off the `data-hero-band` attribute. A hex
writes the same value to both, which is what a hex means.
