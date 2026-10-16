# Recently viewed listings

A visitor's last few opened listings show as a "Recently viewed" row at the
foot of the browse page and of every listing page. The list lives in the
visitor's own browser and is never saved on the server or tied to an account.

## What the visitor sees

- **The row is the browse page's own cards**, four at most, newest first, with
  the heading "Recently viewed" and a Clear button on the right.
- **A listing's page leaves itself out.** Opening Archeo shows the listings
  opened before it, never Archeo.
- **It sits at the foot of the page, under the results or under both
  columns.** The row is drawn after the page loads, because only the browser
  knows what it opened. Above the results it would shove them down the screen a
  moment after they appeared.
- **Nothing is drawn when there is nothing to show**: no history yet, every
  remembered listing gone, storage blocked, or the read failed. There is no
  empty box, no loading row and no error, because the row is an extra.
- **Clear empties the row and the stored list at once.** A reload keeps it
  gone.

## What is remembered

- **Opening a listing's page stores its id**, at the front of the list, moving
  it there if it was already in it.
- **Eight ids are kept and four cards are drawn.** Eight leaves room for a few
  to drop out (below) without the row going short.
- **The ids sit in localStorage under `directory-recently-viewed`.** That
  storage belongs to one web address, and every site has its own address, so
  Eat Drink Toronto's list is never read on another site.
- **A listing only counts once the page has started up in the browser.**
  Somebody who leaves before that has not been recorded. In practice that is
  under a second.

## Why the cards are always fresh

The browser stores ids only. The row asks the server for the cards each time,
through `loadRecentlyViewed` in `src/lib/api/directory/public.ts`.

- **The server returns published listings on the visited site only**, in the
  order asked, through the same `publicListingCardsByIds` the saved lists use.
- **A listing renamed since shows its new name and photo.**
- **A listing put back to draft simply drops out.** The same goes for a
  made-up id, or one from another site pasted into storage by hand.
- **A directory switched off, or kept for members, hands a signed-out visitor
  no cards.** The read checks the directory's own switch itself, because it
  can be called without the page around it.
- **Deal tags follow the browse page's rule**, so a card shows its Deal tag
  only while this visitor may see the Deals page.

## Blocked storage

- **The row's own reads and writes are all wrapped.** A browser that refuses
  storage gets an empty list and no row, and the rest of the page is untouched.
- **The whole site still breaks with storage blocked, for a reason older than
  this row.** The shell's light and dark switcher reads storage without a
  guard (`src/components/shell/sticky-header/light-dark-switcher.tsx:104`), so
  every public page shows "Something went wrong". That fix belongs in Custom
  Shell and was not made from here.

## Where it lives

- `src/lib/directory/recently-viewed.ts` reads, adds to and clears the list.
- `src/components/directory/public/recently-viewed-listings.tsx` records the
  current listing and draws the row.
- `src/routes/directory.tsx` and `src/routes/directory_.$slug.tsx` place it.

## How to check it

1. Open `http://eat-drink-toronto.localhost:3015/directory`. No row yet in a
   fresh browser.
2. Open Archeo, BOKU, Cluny and Mill Street in turn from the browse page. Each
   listing page's row shows the ones before it, newest first, never itself.
3. Back on the browse page the row shows all four, newest first.
4. Press Clear. The row goes at once and stays gone after a reload.
5. Narrow the window to phone width. One card per line and no sideways
   scrolling.
