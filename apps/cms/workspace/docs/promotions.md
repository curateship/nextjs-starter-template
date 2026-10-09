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
- **"On now" is only ever a card saying the deal is running this minute.**
  Chosen on 24 Sep 2026. The page was two groups, "Current deals" and
  "Starting soon", until the redesign on 1 Oct 2026 put every deal in one grid
  and moved that word onto the card.
- **Every owner deal and every owner change is reviewed.** Approving a new
  deal publishes it, and "End now" is the only thing that doesn't wait.
  Chosen on 25 Sep 2026.
- **No automatic sidebar link**, the same rule as Posts and Events. Add
  Promotions to the sidebar in Settings the way the Events link was added.
- **Following a listing needs a signed-in account**, so the email address is
  one the account already confirmed. Chosen on 9 Oct 2026.
- **A follower gets at most one email per listing per day, naming every new
  deal.** Chosen on 9 Oct 2026, so an owner posting ten deals at once sends one
  email, and the email may arrive up to an hour after publishing.

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
  start and an end. The deal window uses the
  same day-by-day editor as the listing window
  (`src/components/shared/weekday-hours-fields.tsx`), including "Copy Monday
  to weekdays".
- **Every day off means all day, every day** of the deal's days. Every deal
  made before times existed is like that.
- **Past midnight.** An end at or before the start runs into the next morning
  and belongs to the night it started. The same start and end means 24 hours.
  A night never starts before the deal's first day.
- **"Same as the listing's hours"** fills every day from the listing's opening
  hours. It is off until a listing is picked, and
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

The page is built like the directory's browse page and the Events page: a band
across the top holding the name and one search bar, then a row of chips and
filter buttons, then one grid of cards. Tyler asked for that shape on
1 Oct 2026, to a drawing.

- **The band** is `PublicHeroBand`, shared with the directory and the Events
  page, so a change to one reaches all three. It holds the breadcrumbs, "Deals",
  the line "Current offers from places on Eat Drink Toronto.", and the bar.
- **The bar asks one question in three parts**: words, a town or postcode, and
  how far. Enter searches from whichever box the visitor is in.
- **One grid, not two groups.** The deals inside their days come first, ending
  soonest first with no-end deals last, then the ones starting on a later day,
  soonest first. There are no "Current deals" and "Starting soon" headings any
  more; each card says where it stands itself.
- **Each card** is read in three passes. The photo carries the place's
  category, a tag, and the headline in a dark pill. The middle is the deal's
  own name and then the place, the neighbourhood and the distance on one line,
  like "12 Tables · Avenue and Lawrence". The foot is two cells under small grey
  labels: "Valid" with "Until Mon, Oct 5", "Today only", "No end date" or
  "Starts Thu, Oct 1 · until Wed, Oct 7", and "Next" with "Tomorrow, 11 AM", or
  "On now" with "Until 6 PM" while it is running.
- **The tag over the photo** says "Ending soon" when the last day is today or
  in the next two days, "Starting soon" before the first day, and "On now" for
  a deal running this minute. A deal that is none of those is left bare. Ending
  soon wins over on now, because a deal that is gone on Thursday is the one
  worth crossing town for today, and the foot already says it is on.
- **The cover photo, or the listing's own** when the deal has none. A card with
  no photo at all moves the headline, the category and the tag into a row above
  the title.
- **A row of cards shares one bottom edge**, so the two labels in the foot line
  up across the row.
- **24 cards a page**, with Previous and Next under them.

## Filters on the Deals page

What a visitor searches by is kept in the address, so a narrowed page can be
reloaded or sent: `?q=lunch`, `?category=pizza,west-end`, `?on=now` or
`?on=ending`, and `?near=…&radius=…&area=…`. Everything keeps the other
filters and goes back to page 1. A mistyped address is ignored rather than
refused.

- **The typed words** match a deal's own name, its headline and the name of the
  place running it. The small print and the description are left out, because a
  match a visitor cannot see on the card reads as a wrong result.
- **Cuisine and Neighbourhood are buttons that drop down**, the same component
  as the directory's browse page (`DirectoryFilterBar`). A group is a parent
  category and its children are the tick boxes, so nothing new is stored and a
  site that adds a third parent gets a third button. Each box carries how many
  live deals are behind it, and a box with none is left out. Two boxes ticked in
  one group means either of them; two groups means both.
- **The "when" chips carry their numbers**: Any time, On now and Ending soon,
  each with how many deals it would show, counted with the typed words, the
  ticked boxes and the distance still applied. The list and the numbers are
  built from the one filter (`dealsNarrowedBy` in
  `src/server/promotions/public.ts`), so a chip can never promise deals the list
  will not show.
- **On now** keeps the deals running at this minute by their times and the
  site's clock, past midnight and 24-hour stretches included. The rule is
  written for the database (`runningAt` in `src/server/promotions/public.ts`)
  so paging and counts are right, and a test checks it against the cards' own
  "On now" at nine clock times.
- **Ending soon** keeps deals whose last day is within three days: today and
  the next two, which Tyler chose on 25 Sep 2026. A deal with no end day never
  counts.
- **Near me** uses the same Near and Within picker as the directory and the
  Events page, and it lives in the band. It keeps deals whose listing's pin is
  within the distance, adds "1.9 km away" to each card's place line, and keeps
  the list in its usual order. A listing with no pin is left out, and the band
  says so under the bar.
- **Nothing matching** says what it was narrowed by, like "Nothing ending soon
  matching "lunch" in Italian."
- The home page's deals row carries its category into "See all deals".

## A deal's page

- The headline in big type at the top, then the title, the listing with a
  link to its page, the days, the times in words with "On now" or when it's
  next on, the description, the Show code button and the small print.
- **The code is never in the page.** A deal with a code shows a Show code
  button, and tapping it asks the server for the code, which then appears
  with a Copy button beside it. The code can't be found in the page source
  before the tap. "Views and Show code taps" below says what the tap counts.
- **An ended deal's page still opens.** It says "This deal has ended" and has
  no Show code button, and the server refuses the code if somebody asks for it
  anyway. `shownCodeAt` in `src/server/promotions/deal-view.ts` is that one
  rule, read after the cache.
- **A deal that gives each visitor their own code** has no Show code button
  either, because its shared code is never shown.
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
  Settings → Public pages → Front page with a count and an optional category,
  like the events row. It shows the newest live deals as cards and "See all
  deals". `drizzle/0099_cms_front_page_deals_row.sql` widened the kind check.
- **Filled after the cache** by `fillFrontPageDeals` in
  `src/server/directory/front-page.ts`, by the site's clock, and only while the
  visitor may see the Deals page. A row with no live deal is dropped, never
  drawn empty.
- The read is `readNewestDeals` in `src/server/promotions/public.ts`, newest
  published first.

## Deals on the directory's map

The browse page at `/directory` can be drawn as a map. A pin whose listing has
a deal on gets its own marker, and the map can be narrowed to those places
alone.

- **The deal marker** is an indigo pin with a per-cent sign in it, in place of
  Google's red one. The card that opens when the pin is clicked shows the
  headline as its Deal tag, the same tag the grid's cards carry, and the pin's
  hover text is "43 Down, 20% off" so the deal is readable without opening the
  card.
- **"Deals only"** is a chip beside the Grid and Map switch, drawn only while
  the map is showing. It writes `?deals=only` into the address, so a map of
  tonight's deals downtown can be sent to somebody.
- **The chip keeps every other filter**, drops the page number, and is drawn
  only when this visitor may see deals at all. On a site that keeps its deals
  for members, a signed-out visitor gets no chip, and a hand-typed
  `?deals=only` draws the whole map rather than an error.
- **"A deal on" is the same rule as the Deal tag on a card**: published, at a
  published listing, started, and not over, by the site's clock. `dealIsOnAt`
  in `src/server/promotions/public.ts` is that rule, and the marker and the tag
  both read it, so a pin and its card can never disagree.
- **The switch narrows the map's own query**, not the pins it got back. The map
  draws at most 100 pins and says so when there are more; narrowing afterwards
  would cap first and filter second, so a site with 300 mappable listings would
  lose the deals that happen to sort past the hundredth. The condition is
  `listingHasDealOn` in `src/server/promotions/public.ts`, handed to
  `readDirectoryMap` because only that file may read the deals table.
- **A narrowed map with no pins says so in its own words**: "No place with a
  deal on is on this map. Switch Deals only off to see every listing here."
- **The marker's colours are written out, not read from the theme.** This app
  never asks Google for a dark map, so the tiles stay light whichever colour
  mode the site is in. A marker in a theme colour would go pale on a pale map
  the moment somebody switched to dark. `DEAL_MARKER_ICON` in
  `src/lib/directory/listing-map.ts` holds the drawing, and a test keeps the
  fixed colours there on purpose.
- **Nothing about this needs a Google Maps key to check.** No local site has
  one, so the markers and the narrowing are proven by the tests in
  `src/server/directory/public-map.test.ts` and
  `src/lib/directory/listing-map.test.ts`, and the chip and the empty wording
  are checked in a browser on a site with no map drawn.

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
  sent by email with the deal and the listing's address. Each is unique across
  the site, and "Using a code at the counter" below is where it is used.
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

## Using a code at the counter

A claimed deal has its own page, `/deals/code/K7QX-P2MD`, linked from the claim
email and from the deal page right after claiming. It is the code in big
characters, a QR beside it, and whether it has been used. At the counter the
owner points a phone camera at the QR, which opens that same page with a
**Mark used** button on it, or types the code into the counter box instead.

- **The link is the code and nothing else.** No deal address in it, so an admin
  renaming the deal never breaks a code that is already in somebody's inbox or
  on their screen. A code is therefore unique across the whole site, not just
  within its deal (`ux_promotion_claims_site_code`).
- **A code cannot be guessed.** Eight characters from 31 letters and digits is
  850 billion of them, and a wrong one costs one of thirty tries an hour from
  that internet address, while a real one clears the count. A counter working
  through a queue never meets the limit.
- **The QR is black on white in both colour modes.** A code drawn in theme
  colours goes pale in dark mode, which is exactly when a phone at a counter is
  dimmest. `src/components/shared/qr-code.tsx` writes the two colours out, the
  same deliberate exception the map's deal marker takes.
- **Anybody holding the code may open the page**, which is the point: the
  person who claimed has no account. It shows their name, their code and the
  used time, never their email, and it is marked noindex.
- **Only the listing's owner or a site admin sees Mark used**, and the door
  checks that again for itself rather than trusting the page. An admin works on
  the site they are in; an owner only on their own deal, through
  `ownersDealSite`.
- **Used is written once.** Two phones marking the same code at the same moment
  both run the same conditional write, and only the one that finds the time
  still empty changes anything, so the second is told when the first used it
  rather than overwriting it.
- **Already used is the whole feature.** A screenshot of a used code says
  "Already used" with the time, so "one per customer" holds.
- **No camera code in the browser.** The phone's own camera app opens the link,
  which works on every phone, and a typed code always works as well. The
  counter box takes the code as printed, in lower case, without its dash, or
  the whole link pasted in; `readScannedCode` in
  `src/lib/promotions/claim-code.ts` is that one reader, and the event tickets
  in events task 30 can use it rather than writing a second one.
- **The counter box belongs to one deal.** A real code for a different deal is
  refused by name instead of being marked used on the deal that happens to be
  open, the same rule the old app's door screen had for events.
- **Where it is.** The owner's is "At the counter" on each deal in My listings,
  which also holds "Who claimed"; the admin's is the same box in the deal's
  window in Admin → Promotions. Both say "12 of 30 codes used".
- **A used claim is never taken away.** Freeing the place would let that email
  claim a second code, so the bin is off with the reason on it, and the
  database holds the rule too
  (`promotion_claims_used_not_cancelled_check`).
- **A deal that has ended still reads at the counter**, and the screen says it
  has ended rather than refusing: the owner decides whether to honour it.
- The times live on `promotion_claims.used_at` and `used_by_user_id`
  (`drizzle/0110_cms_promotion_claim_used.sql`); the rules are the counter
  section of `src/server/promotions/claims.ts`, and the doors are in
  `src/lib/api/promotions/claims.ts`, with the public one listed in
  `open-endpoints.ts`.

## Views and Show code taps

Each deal has two numbers: how many people opened its page, and how many of
them tapped Show code. The owner sees both under each of their deals on My
listings, as "300 views · 45 tapped Show code". Admin → Promotions has a Views
column and a Show code column, and both sort the whole list biggest first.

- **One person counts once per deal per day, for each number.** Reloading the
  page all afternoon is one view, and tapping Show code five times is one tap.
  The next day the same person counts again.
- **A person is the traffic counter's own daily fingerprint**: a hash of that
  day's secret salt, the internet address and the browser. It is the same rule
  the Traffic screen uses for unique visitors, so nothing new identifies
  anybody. The fingerprints are deleted once their day is over; only the day's
  two numbers stay.
- **Left out the same way the Traffic screen leaves them out**: bots by their
  browser name, pages a browser loads ahead of time without being asked, and
  admins, including an admin viewing the site as a member. One person can be
  counted at most 240 times in ten minutes across every deal, so a script
  cannot run the numbers up.
- **Not the Traffic screen's figure.** Listing and event views on their screens
  add one for every page load. These count people once a day, so a deal's 300
  views and its page's figure on the Traffic screen can differ. That is on
  purpose: the task asked for one count per person per day.
- **Days are UTC days**, the traffic counter's own, because the salt changes at
  UTC midnight. Toronto's evening falls on the next UTC day.
- **Over all time.** The numbers are every day added up, ended deals included,
  so an owner can see how a past deal did before running it again.
- **No code, no tap number.** A deal with no code, or one that gives each
  visitor their own, has no Show code button. My listings shows its views
  alone, and the admin column says "No code". A deal that had a code and taps
  before the code was removed keeps showing those taps.
- **The owner sees only their own deals' numbers**, because the numbers come
  with the owner's own deals and no others (`ownerDealsFor`).
- **Not proof anybody used the deal.** Tapping Show code means somebody looked
  at the code. "Using a code at the counter" above is the proof of use.
- Stored in `promotion_daily_counts` and `promotion_count_visitors`
  (`drizzle/0123_cms_promotion_counts.sql`); the rules are
  `src/server/promotions/counts.ts`, and the two doors are `countDealViewFn`
  and `showDealCodeFn` in `src/lib/api/promotions/public.ts`, listed in
  `open-endpoints.ts`. Deleting a deal deletes its numbers.

## Following a listing for its deals

A listing's page has a "Follow for deals" button under its name. A follower
gets an email when that listing publishes a new deal.

- **It needs an account.** Signed out, the button takes the visitor to sign in
  and back. The email goes to the account's own address, read when the email
  is sent, so a changed address is used straight away.
- **The button is right after a reload.** Whether this person follows is read
  with the listing's page, after the page's cache. It says "Following" once on,
  and tapping it again unfollows.
- **Only while the Deals page is open to this visitor.** No deals, no button.
  A draft listing can't be followed.
- **One email per listing per day, naming every new deal.** The email waits
  until the listing's newest unsent deal is an hour old, so deals posted in
  one sitting land in one email. Once a follower has had an email about a
  listing today, by the site's own calendar, anything published later waits for
  the next day's email. Deals posted less than an hour apart are one email; a
  deal posted at 9 AM and another at 5 PM are two emails on two days.
- **Only deals published after the follow.** Deals already up when somebody
  follows are never sent.
- **A deal that is gone before its email** (ended, unpublished, deleted, or at
  a listing taken back to draft) is left out. If none are left, nothing is
  sent and the day is not used up.
- **Nothing while the Deals page is switched off.** The deals wait, and go once
  it is back on if they are still running.
- **What the email says.** "2 new deals at Ramen Ya" or "New deal at Ramen Ya:
  20% off", then one line per deal with its headline, title, days and address,
  and a button to the deal, or to the listing's page when there are several.
  When the directory is closed to visitors the button goes to the Deals page.
- **One-tap unfollow, no sign-in.** Every email ends with "Stop following Ramen
  Ya" and carries the headers that make an inbox's own Unsubscribe button work.
  The link is signed with the site's secret, so it can only ever end the one
  follow it was made for. Following again makes a new follow, and an old
  email's link does not end it.
- **A failed send is tried again** after ten minutes, and is never sent twice:
  each follow is claimed before its email goes.
- **Sent by the background loop**, which asks at most once a minute. Locally
  that is the dev server's own loop; deployed it is the worker.
- Stored in `listing_follows` (`drizzle/0124_cms_listing_follows.sql`). The
  rules are `src/server/promotions/follows.ts`, the email is
  `src/server/promotions/follow-mail.ts`, the door is
  `src/lib/api/promotions/follows.ts`, the unfollow link is
  `src/routes/api/listing-unfollow.ts`, and the button is
  `src/components/promotions/public/follow-button.tsx`. Deleting the listing or
  the account deletes the follow.

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
- `src/lib/api/promotions/` holds the doors. The public ones are listed in
  `src/app/open-endpoints.ts` with the reason they need no sign-in.
- **The longest each text box may be lives in
  `src/lib/promotions/deal-limits.ts`**, not in the server's files. The doors
  check input against those numbers outside the handler, and that part runs in
  the browser. A door that imports anything from `src/server/promotions/` for
  use outside a handler pulls the password library into the page, and every
  page of the site stops working.
- **The directory's map reads deals through one condition.**
  `listingHasDealOn` in `public.ts` returns an `exists` on the deals table that
  `readDirectoryMap` in `src/server/directory/public.ts` adds to its own query.
  The condition is built in `public.ts` and handed over rather than written
  where it is used, because `private.test.ts` keeps the table readable from
  that one file.
- **The Deals page's own parts** are `src/components/promotions/public/`:
  `deals-hero.tsx` is the band, `deal-filters.tsx` the "when" chips, and
  `deal-grid.tsx` the card, which the home page's deals row and a category
  page's deals draw too. Those two ask for less, so the category, the
  neighbourhood and the tag are missing rather than empty, and the card leaves
  out whatever it was not given.
- **The place's category and neighbourhood come from the directory's own
  reader** (`categoryForCards` in `src/server/directory/public.ts`), so a deal
  card and a listing card can never file the same place under two different
  categories.
- **The email to followers reads deals through the one filter too**:
  `dealsPublishedSince` in `public.ts`, so a draft or a deal at a draft listing
  is never sent.
- `src/routes/deals.tsx`, `src/routes/deals_.$slug.tsx` and
  `src/routes/deals_.code.$code.tsx` are the public pages;
  `src/routes/_authenticated/admin/promotions.tsx` is the admin screen.

## Not built yet

Deals in the site's own search box, the sitemap and the feed (08). The Deals
page's own search box is built; this is about finding a deal from anywhere
else. The task files are in `workspace/tasks/promotions/`.
