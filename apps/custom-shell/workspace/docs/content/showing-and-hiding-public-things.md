# Hiding a row, and choosing its screens

Two separate choices sit on a front page row, and one of them also sits on a
public menu item. They answer different questions and work in different ways.

## Hidden: kept out of the page

**Hide this row from visitors** is a switch in the row window. A hidden row is
dropped from what the server sends a visitor, in the same pass that already
drops a row with no heading. It is not in the page, not in the page's data, and
not in the page source, so a row can be built over several sittings without
anyone reading it half-finished.

The Settings editor still lists it, with **Hidden** on its second line beside
the kind and the width. Flipping the switch back puts it on the public page on
the next load. Nothing else about the row changes while it is hidden.

Only front page rows have this. A menu item has no equivalent, because a menu
item nobody should see is a menu item to delete.

## Shown on: drawn on some screens

**Shown on** offers three choices: Everywhere, Desktop only, Phone only.
Everywhere is the default and is what every row and menu item saved before this
existed reads as.

It sits on a front page row and on a public header menu item, which means a
link or a dropdown group. A group's own links follow the group. The public
footer has no such choice, because the footer is one list at every width.

**Where the line falls depends on which of the two it is**, because each
follows the layout it lives in:

- A **front page row** switches at 768px, the width the public content grid
  already changes at.
- A **header menu item** switches at 1024px, the width the header already swaps
  its desktop row for the phone panel at.

Inventing a third width would have fought one of those two layouts, so the two
numbers are stated here instead.

## The honest limit

**A per-device thing still ships in the page.** A desktop-only row is in the
page source at phone width with a class hiding it, and a menu item is in
whichever of the header's two lists it belongs to, both of which are always in
the page. This only matters for something heavy or something that should not be
read at all.

Use **Hidden** for anything that must not reach a visitor. Use **Shown on** for
tuning a page that is already public.

**Hiding every row brings the built-in pricing page back.** The front page
falls back to it whenever no rows reach a visitor, and that rule cannot tell a
page with no rows from a page whose rows are all hidden. Leave one row shown,
or switch the page off in Public Pages, if the intention is to take it down.

**The first row supplies the page's main heading.** A hidden first row hands
that job to the next row, because a hidden row is not in the page at all. A
desktop-only first row keeps it, so a phone visitor sees the second row's
heading first while the main one sits in the markup, hidden. Lead with a row
everyone sees and neither case arises.

## Where it lives

- `lib/pages/public-device.ts` — the three choices, the row classes, and the
  question each header list asks.
- `lib/pages/front-page.ts` — `hidden` and `device` on a row, and
  `visibleFrontPageRows`, which the public read calls and the admin read does
  not.
- `lib/pages/public-navigation.ts` — `device` on a menu link and group, written
  down only when it is not Everywhere, and `publicNavigationForDevice`.
- `components/shell/public-navigation.tsx` builds its two lists from that;
  `components/marketing/front-page-rows.tsx` puts the class on the row.
