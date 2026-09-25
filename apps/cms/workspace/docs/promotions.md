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
- **Five deal types: money off, percent off, 2 for 1, free item and other.**
  Chosen on 24 Sep 2026. A type can be added later but never removed or
  renamed, because old deals store it.
- **Money off and percent off build their headline from a number**, "$5 off"
  from 5 and "20% off" from 20. The other three types have a typed headline of
  24 characters at most. Chosen on 24 Sep 2026.
- **A deal made before types existed shows "Deal"** until someone edits it,
  and saving it then needs a type, the same as a new deal. Chosen on
  24 Sep 2026.
- **A deal can run past midnight.** 10 PM to 2 AM is allowed, and 1 AM
  Saturday counts as Friday night. On the deal's last day that night still
  runs until it closes. Chosen on 24 Sep 2026.
- **A day can have two stretches of time**, the same as a listing's opening
  hours. Chosen on 24 Sep 2026.
- **"Same as the listing's hours"** is one button in the deal window. Chosen
  on 24 Sep 2026.
- **The Deals page's first group is "Current deals".** "On now" is only ever
  a card saying the deal is running this minute. Chosen on 24 Sep 2026.
- **No automatic sidebar link**, the same rule as Posts and Events. Add
  Promotions to the sidebar in Settings the way the Events link was added.

## What a deal holds

One row in the `promotions` table (`drizzle/0095_cms_promotions.sql`), each
thing in its own column: the site, the listing, title, address part,
description, cover photo, start day, end day (optional), code (optional),
small print, type, headline, draft or published, and the admin who wrote it.
The type and headline came in `drizzle/0096_cms_promotion_headline.sql`. The window shows
who wrote it and when. If that account is later deleted, the deal stays and
the window says "an account that is gone".

## Types and the headline

The headline is the few words a card shows in big type, so a visitor can
compare "20% off" and "Free dessert" without opening either deal. The site
never works out what a visitor saves.

| Type | Headline |
| --- | --- |
| Money off | Built from dollars and cents: 5 gives "$5 off", 5.50 gives "$5.50 off", 1000 gives "$1,000 off". Up to $99,999.99. |
| Percent off | Built from a whole number from 1 to 100: 20 gives "20% off". |
| 2 for 1 | Typed, up to 24 characters. |
| Free item | Typed, up to 24 characters. |
| Other | Typed, up to 24 characters. |

- **One rule for everyone.** `src/lib/promotions/deal-headline.ts` holds the
  types, the number check and the built words. The window, the server and the
  pages all use it.
- **The number is kept** in `amount`, so the window shows 20 again when the
  deal is reopened. The typed types have no number.
- **The database holds it together too.** A deal with a type always has a
  headline, and only money off and percent off have a number.
- **The window shows the headline before saving.** Under the boxes it says
  "Cards show 20% off" as soon as the number is readable.
- **A long headline wraps** inside the card and at the top of the deal page,
  breaking even a single long word, so it never makes the page wider than a
  phone.

## Days and the site's time zone

- **Days, not moments.** The start and end are plain days, stored the same way
  events store theirs. The site's time zone (Settings → Directory) says when a
  day starts and ends.
- **On through the whole end day.** A deal that ends on 12 Oct is on until
  midnight at the end of 12 Oct, site time, or until its last night closes if
  that night runs past midnight. `dealStage` in
  `src/lib/promotions/deal-times.ts` is the one rule for inside its days,
  starting soon and ended.
- **Gone once it's over, with no job.** The Deals page asks the database for
  deals whose end day is today or later, plus any whose end day was yesterday
  while that night is still running. The site's clock is worked out on every
  visit and is part of the page's cache key, so an answer from before the
  deal ended is never reused.

## Times of day

A deal can run only on some weekdays and at some hours, like "Mon to Fri, 4 to
6 PM". It is still one deal with one start day and one end day. The times only
say when, inside those days, it is on. They came in
`drizzle/0097_cms_promotion_times.sql`.

- **Shaped like a listing's opening hours.** Each weekday is off, or has a
  start and an end, and optionally a second stretch. The deal window uses the
  same day-by-day editor as the listing window
  (`src/components/shared/weekday-hours-fields.tsx`), including "Copy Monday
  to weekdays".
- **Every day off means all day, every day** of the deal's days. Every deal
  made before times existed is like that.
- **Past midnight.** An end at or before the start runs into the next morning
  and belongs to the night it started. The same start and end means 24 hours.
  A night never starts before the deal's first day.
- **"Same as the listing's hours"** fills every day from the listing's opening
  hours, second stretches included. It is off until a listing is picked, and
  says so if the listing has no hours. "All day, every day" empties them again.
- **A day switched on needs both times.** The save names the day, like "Give
  Thursday a start and an end time."
- **The window shows the words before saving**: "The page says: Mon to Fri,
  11 AM to 3 PM".
- **"On now" comes from the server.** After the page cache, the server reads
  the site's clock and writes each card's line: "On now · until 6 PM" while it
  runs, otherwise "Next: today at 4 PM", "Next: tomorrow at 4 PM", "Next: Sat
  at 4 PM" within the week, or "Next: Sat, Oct 10 at 4 PM" further out. A deal
  with no times just says "On now" inside its days. The visitor's own clock is
  never asked.
- **In words** the times group the days that share them: "Mon to Fri, 4 to
  6 PM", "Sat and Sun, 12 to 3 PM and 10 PM to midnight", "Every day, all
  day".
- The rules live in `src/lib/promotions/deal-times.ts`. The list's
  still-running-last-night check is the same rule written for the database, in
  `lastNightStillOn` in `src/server/promotions/public.ts`.

## The Deals page

- **Two groups.** "Current deals" comes first: every deal inside its days,
  ending soonest first, with no-end deals last. "Starting soon" follows, starting soonest first. Every deal that
  has not started yet shows there, however far off it is.
- **Each card** shows the deal's cover photo, or the listing's own photo when
  the deal has none, then the headline in big type, the title, the listing's
  name, and a line like
  "Until Sun, Oct 12", "Today only", "No end date" or "Starts Thu, Oct 1 ·
  until Wed, Oct 7", then "On now · until 6 PM" or "Next: today at 4 PM".
- **24 cards a page**, with Previous and Next under them.

## A deal's page

- The headline in big type at the top, then the title, the listing with a
  link to its page, the days, the times in words with "On now" or when it's
  next on, the description, the code and the small print.
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
- **New deal** opens a window with five cards: the deal (title, address part,
  listing, status, cover photo), the headline (type, then the number or the
  words), its days, its times, and what the page says (description, code,
  small print). Publishing and unpublishing is the Status box.
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

Owners posting deals (task 04), search, sitemap and feed (08), and claiming a
deal (13). The task files are in `workspace/tasks/promotions/`.
