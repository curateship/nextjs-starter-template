# Promotions

Each site can list deals, like "Two-for-one pasta Tuesdays" at 43 Down. An
admin writes them in Admin → Promotions. Visitors see them on the Deals page at
`/deals`, and each published deal has its own page at `/deals/<address>`.

## Rules Tyler set

- **Visitors see "Deals" at `/deals`; Admin says "Promotions".** Chosen on
  24 Sep 2026.
- **Every deal belongs to exactly one listing.** Chosen on 24 Sep 2026. A deal
  can't be saved without one, and the listing must be on the same site.
- **A deal with no end day never ends until someone ends it.** Chosen on
  24 Sep 2026. Its page says "No end date".
- **Deleting a listing deletes its deals.** Chosen on 24 Sep 2026, because a
  deal with no place means nothing. The database does it, so no code path can
  forget. The listing's delete warning says how many deals go with it first.
- **A deal at a draft listing stays off every public page** until the listing
  is published. Chosen on 24 Sep 2026. Its own page answers "not found" too.
- **No automatic sidebar link**, the same rule as Posts and Events. Add
  Promotions to the sidebar in Settings the way the Events link was added.

## What a deal holds

One row in the `promotions` table (`drizzle/0095_cms_promotions.sql`), each
thing in its own column: the site, the listing, title, address part,
description, cover photo, start day, end day (optional), code (optional),
small print, draft or published, and the admin who wrote it. The window shows
who wrote it and when. If that account is later deleted, the deal stays and
the window says "an account that is gone".

## Days and the site's time zone

- **Days, not moments.** The start and end are plain days, stored the same way
  events store theirs. The site's time zone (Settings → Directory) says when a
  day starts and ends.
- **On through the whole end day.** A deal that ends on 12 Oct is on until
  midnight at the end of 12 Oct, site time. `dealStage` in
  `src/lib/promotions/deal-days.ts` is the one rule for on now, starting soon
  and ended.
- **Gone the next morning with no job.** The Deals page asks the database for
  deals whose end day is today or later, with the site's today worked out on
  every visit. So the first visit after midnight simply doesn't get the ended
  deal back. The site's today is part of the page's cache key, so a cached
  answer from yesterday is never reused.

## The Deals page

- **Two groups.** "On now" comes first, ending soonest first, with no-end
  deals last. "Starting soon" follows, starting soonest first. Every deal that
  has not started yet shows there, however far off it is.
- **Each card** shows the deal's cover photo, or the listing's own photo when
  the deal has none, then the listing's name, the title, and a line like
  "Until Sun, Oct 12", "Today only", "No end date" or "Starts Thu, Oct 1 ·
  until Wed, Oct 7".
- **24 cards a page**, with Previous and Next under them.

## A deal's page

- Title, the listing with a link to its page, the days, the description, the
  code and the small print.
- **An ended deal's page still opens.** It says "This deal has ended", and the
  server leaves the code out of the page entirely, so it can't be found in the
  page source either. `dealViewAt` in `src/server/promotions/deal-view.ts` does
  this after the cache.
- **A deal that hasn't started** says "Not on yet" under its days.
- **The listing is a link only while the Directory page is open to everyone.**
  Otherwise its name is plain text, the same rule as an event's place.
- A draft, a deal at a draft listing, another site's deal and an address
  that was never used all answer the same "not found" page.

## The on/off switch

The Deals page has its own row on the Pages screen (`src/routes/deals.page.ts`).
Switched off, `/deals` and every deal page answer "not found". Kept for
members, a signed-out visitor gets "not found" too. The endpoints check the
switch themselves, not only the page, because anyone can call an endpoint
directly.

## Admin → Promotions

- A table with search (title, listing name, address part and code), a status
  filter, sorting and paging, built like Admin → Events.
- **New deal** opens a window with three cards: the deal (title, address part,
  listing, status, cover photo), its days, and what the page says
  (description, code, small print). Publishing and unpublishing is the Status
  box.
- The Status column adds "Ended" when a published deal is over, and "Listing
  is a draft" when the deal can't be seen for that reason.
- Deleting asks first and takes one request for the whole selection.
- A new deal's address comes from its title unless one is typed. A title with
  no letters or numbers, like "🍝🍝", gives no address, so the save asks for
  one to be typed.

## Where the code is

- `src/server/promotions/schema.ts` is the table. `promotions.ts` is the admin's
  reads and writes. `public.ts` is every public read.
- **Every public read goes through `listedDealsOnSite`** in `public.ts`:
  published, on this site, at a published listing.
  `src/server/promotions/private.test.ts` fails when a new export in
  `public.ts` isn't proven to leave out drafts and deals at draft listings, or
  when a file other than those three reads the table.
- `src/lib/api/promotions/` holds the doors. The two public ones are listed in
  `src/app/open-endpoints.ts` with the reason they need no sign-in.
- `src/routes/deals.tsx` and `src/routes/deals_.$slug.tsx` are the public
  pages; `src/routes/_authenticated/admin/promotions.tsx` is the admin screen.

## Not built yet

Owners posting deals (task 04), a headline like "20% off" (02), happy hour
times (03), search, sitemap and feed (08), and claiming a deal (13). The task
files are in `workspace/tasks/promotions/`.
