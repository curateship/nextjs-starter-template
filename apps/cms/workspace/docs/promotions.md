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
- **Every owner deal and every owner change is reviewed.** Approving a new
  deal publishes it, and "End now" is the only thing that doesn't wait.
  Chosen on 25 Sep 2026.
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

## Filters on the Deals page

Chips and a distance above the cards, all kept in the address so a filtered
page can be reloaded or sent: `?category=pizza`, `?on=now` or `?on=ending`,
and `?near=…&radius=…&area=…`. Each chip keeps the other filters and goes back
to page 1. A mistyped address is ignored rather than refused.

- **Category chips** are the categories with a live deal at a listing filed
  directly under them, in the admin's order (`readDealCategories`). A category
  whose only deals are drafts, at draft listings or over never gets a chip.
- **On now** keeps the deals running at this minute by their times and the
  site's clock, past midnight and 24-hour stretches included. The rule is
  written for the database (`runningAt` in `src/server/promotions/public.ts`)
  so paging and counts are right, and a test checks it against the cards' own
  "On now" at nine clock times.
- **Ending soon** keeps deals whose last day is within three days: today and
  the next two, which Tyler chose on 25 Sep 2026. A deal with no end day never
  counts.
- **Near me** uses the same Near and Within picker as the directory and the
  Events page. It keeps deals whose listing's pin is within the distance, adds
  "1.9 km away" to each card, and keeps the list in its usual order. A listing
  with no pin is left out, and the page says so.
- **Nothing matching** says what it was narrowed by, like "Nothing ending soon
  in Italian."
- The home page's deals row carries its category into "See all deals".

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

## Deals on a listing's page and its card

- **"Deals here"** sits in a listing page's wide column, above "What's on
  here", which Tyler chose on 25 Sep 2026. It shows up to three of the
  listing's live deals in the Deals page's order, each with its headline, its
  title as a link, and "On now · until 6 PM" or when it is next on. No live
  deal means no box and no heading.
- **The Deal tag** on a listing's card on the directory's browse page and its
  category pages shows the headline of the listing's newest deal that is on
  now, by published date. A deal that hasn't started doesn't tag the card, and
  the tag is gone once the deal is over.
- **Both are read after the page cache**, by the site's clock, and only while
  the visitor may see the Deals page. The tags for a whole page of cards are
  one query (`dealHeadlinesFor` in `src/server/promotions/public.ts`), never one
  per card; a test counts it.

## Deals on category pages and the home page

- **A category page** shows up to 6 of the newest live deals at listings filed
  directly under that category, above its listings and on its first page only,
  headed "Deals in <category>". A deal's category is always its listing's.
- **Only the category itself, never its children.** A category page's listings
  and events work the same way (`listingIdsInCategory` in
  `src/server/directory/public.ts` says so), and the task said to match events.
  The task file had assumed a parent page shows its children's; it does not.
- **A home page row of deals** is a fourth row kind, "Current deals", added in
  Settings → Directory → Front page with a count and an optional category,
  like the events row. It shows the newest live deals as cards and "See all
  deals". `drizzle/0099_cms_front_page_deals_row.sql` widened the kind check.
- **Filled after the cache** by `fillFrontPageDeals` in
  `src/server/directory/front-page.ts`, by the site's clock, and only while the
  visitor may see the Deals page. A row with no live deal is dropped, never
  drawn empty.
- The read is `readNewestDeals` in `src/server/promotions/public.ts`, newest
  published first.

## Report a problem on a deal

A deal's page ends with the same small "Report a problem" link as a listing
and an event, and it stays after the deal is over. The report lands in
Admin → Reported problems with Kind "Deal".

- **A deal's own reasons**: "The deal wasn't honoured", "It has ended", "Wrong
  details" and "Something else", which needs a line saying what.
- **No account.** Nothing on the deal changes; an admin reads the report and
  edits the deal by hand, from the report's "Edit the deal" button.
- **The limits are shared** with listing and event reports: one per deal per
  hour from a visitor, ten an hour from a visitor, fifty an hour for the site.
  The owner isn't told in this version, the same as listings.
- **Only a deal a visitor could read** can be reported: a draft or a deal at a
  draft listing is "no longer on this site", never "that is a draft". A closed
  Deals page takes no reports.
- Stored in `directory_listing_reports.promotion_id`
  (`drizzle/0100_cms_promotion_reports.sql`), with the database holding each
  kind to its own reasons. Deleting a deal deletes its reports.
  `workspace/docs/listing-problem-reports.md` covers the queue.

## Claiming a deal

An admin or an owner can switch on "Visitors claim it" in the deal's window
and give how many can claim it, like the first 50 people, or leave it empty
for no limit. An owner's switch is part of the deal they send, so it is
reviewed like the rest.

- **A name and an email, no account.** Checked by the same rules as an event
  sign-up. The deal page's box shows "30 of 50 left", "All claimed" once they
  are gone, and "Claims have closed" once the deal is over. A deal that hasn't
  started can already be claimed.
- **Everyone gets their own code**, like "K7QX-P2MD", eight letters and
  digits with none that are easy to misread. It is shown once on the page and
  sent by email with the deal and the listing's address. Each is unique within
  the deal, so a later task can mark it used at the counter.
- **No shared code while claims are on.** The code in the deal's window is
  never shown, because a shared code can be screenshotted and passed round.
- **One live claim per email per deal.** Claiming again with the same email
  shows no code and sends it to that email again, so typing somebody else's
  email gets nobody their code. The page says so plainly.
- **The last place goes to exactly one person.** A claim locks the deal's row
  before counting, the same lock as event sign-ups. Proven on the local
  Postgres on 25 Sep 2026: 40 people claiming 1 place at once, 5 rounds, gave
  1 claim every round; the same code without the lock gave 1, 18, 40, 40 and
  23. The test database runs one transaction at a time, so it can't show this.
- **A failed email never undoes a claim.** The page says the code couldn't be
  emailed and asks the visitor to keep it from the screen.
- **Who claimed.** The admin's window lists each person's name, email, code
  and day, and can take a claim away, which frees the place so the same email
  can claim again. The owner's "Who claimed" on My listings is the same list,
  read-only, for their own deals only.
- **Limits:** eight claims an hour from one internet address per site.
- The rules are `src/server/promotions/claims.ts`, the claims live in
  `promotion_claims` (`drizzle/0101_cms_promotion_claims.sql`), and the door
  is `src/lib/api/promotions/claims.ts`, listed in `open-endpoints.ts`.

## Owners post, change and end deals

A listing's owner has a "Deals at <listing>" card on My listings, under their
events. They write a deal in the same boxes the admin's window has, less the
listing, the address part and the status.

- **The listing comes from the owner's approved claim**, never from the form.
  An id from somebody else's claim is simply not found.
- **Everything waits in one queue**, Admin → Deals from owners
  (`/admin/promotion-requests`), reached from the "From owners" button on
  Admin → Promotions, which shows how many are waiting. Each row says "New
  deal" or "Change". There is no selection column, the same as the event
  suggestions queue, so nothing is approved in bulk unread.
- **Approving a new deal publishes it** at the owner's listing and remembers
  the owner (`promotions.owner_user_id`). Approving a change swaps the new
  wording into the live deal and leaves its address, status and listing alone.
  The live deal stays exactly as it was while a change waits.
- **The queue shows a change side by side**: only the lines that differ, the
  live wording beside the new, and one sentence naming what stays.
- **One change waits at a time.** A second one is refused until the first has
  been read, and the Change button says why it is off.
- **"End now"** asks first, then the deal is off every public list at once and
  its page says "This deal has ended". A waiting change is closed with a note.
  The admin's window says the deal was ended early and has "Start it again".
- **The owner sees only their own.** Each row says "Waiting for approval",
  "Approved" with a link, "Not approved" with the admin's note, or "Ended". A
  new owner of the listing sees none of the old owner's deals.
- **Refusals are sentences**: another person's listing, the Deals page
  switched off, an end day that has been, a photo that is not the owner's own
  upload, or more than 20 deals and changes in an hour.
- **Emails.** The admins are told something is waiting. The owner is told the
  decision, with the admin's note. A failed email never undoes the decision,
  and the admin's message says whether the owner was reached.
- The rules are `src/server/promotions/owner-requests.ts`, the requests live
  in `promotion_requests` (`drizzle/0098_cms_owner_promotions.sql`), and the
  owner's and admin's windows share their cards through
  `src/components/promotions/deal-fields.tsx`.

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
- **The longest each text box may be lives in
  `src/lib/promotions/deal-limits.ts`**, not in the server's files. The doors
  check input against those numbers outside the handler, and that part runs in
  the browser. A door that imports anything from `src/server/promotions/` for
  use outside a handler pulls the password library into the page, and every
  page of the site stops working.
- `src/routes/deals.tsx` and `src/routes/deals_.$slug.tsx` are the public
  pages; `src/routes/_authenticated/admin/promotions.tsx` is the admin screen.

## Not built yet

Search, sitemap and feed (08). The task files are in `workspace/tasks/promotions/`.
