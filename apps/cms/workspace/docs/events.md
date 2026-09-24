# Events

Each site can list events. An admin writes them in Admin → Events, and each
published event has its own page at `/events/<address>`.

## Rules Tyler set

- **Every site starts on Toronto time.** Chosen on 23 Sep 2026. Old sites and
  new ones both get `America/Toronto` until an admin changes it in
  Settings → Directory → Time zone.
- **The end time is optional.** With no end time, the page shows only the start
  time, and the event counts as over once its day is over in the site's time
  zone.
- **No automatic sidebar link**, the same as posts. Add Events to the sidebar
  in Settings the same way the Listings and Posts links were added.
- **Real columns, not a JSON blob.** The old Directory app kept the date, time
  and place inside one JSON field. Here each is its own column.
- **No page templates.** The event page layout is fixed, the same way posts
  are.
- **A past event stays in the sitemap for 30 days after it ends.** Chosen on
  23 Sep 2026. The page itself keeps working after that.
- **The feed places an event by the day it was published**, not the day it
  happens. Chosen on 23 Sep 2026, so the feed stays "what is new on the site".
- **The search box's suggestions offer only events that are not over yet.**
  Chosen on 23 Sep 2026. The full search page still finds past events.
- **No place, no Google block.** Chosen on 23 Sep 2026. Google refuses an
  event without a place, so an event with neither a place name nor a street
  address gets no event markup at all.
- **A repeating event is one row in Admin → Events.** Chosen on 23 Sep 2026,
  so a weekly trivia night does not add 52 rows a year. Its dates open from
  the main event's window.
- **Deleting the main event deletes every date.** Chosen on 23 Sep 2026.
  Setting the repeat to "Does not repeat" is how an admin stops a series and
  keeps the dates that have been.
- **A suggested event goes straight to the queue.** Chosen on 24 Sep 2026.
  There is no email to confirm first, unlike Add your listing. The hidden box
  and five an hour from one address keep spam down.
- **The Suggest an event form has a fixed list of required boxes**: the name,
  the day, the start time and the email. Chosen on 24 Sep 2026, over a setting
  where the admin picks. The server checks the same list as the browser.
- **The photo comes with the form**, and is filed in the Media library only
  when the suggestion is approved. Chosen on 24 Sep 2026.
- **The Events page has a "Suggest an event" button** while the Suggest an
  event page is on. Chosen on 24 Sep 2026. The page starts on for every site.
- **Approving a listing owner's event publishes it.** Chosen on 24 Sep 2026,
  because the owner wrote it for their own place. A public suggestion still
  becomes a draft.
- **Every owner's event is reviewed,** however many were approved before.
  Chosen on 24 Sep 2026. No owner is trusted to skip the queue.
- **An owner sends one date at a time.** Chosen on 24 Sep 2026. An admin can
  make an owner's event repeat in the event window after approving it.

## What an event is

- **The table:** `events`, from `drizzle/0083_cms_events.sql`. An event has a
  title, an address, a cover image, a summary, a body, a status, a start day
  and time, an optional end day and time, a place name and a street address.
  `drizzle/0084_cms_events_visibility.sql` adds `visibility`, which is
  `public` or `private`. Every event made before it is public.
  `drizzle/0085_cms_event_repeats.sql` adds the repeat columns that
  "Repeating events" below describes. `drizzle/0086_cms_event_listing.sql`
  adds `listing_id`, for "The place is a listing" below.
  `drizzle/0087_cms_event_position.sql` adds `latitude`, `longitude` and
  `located_for`, for "The map on the event page" below.
- **The body:** the same writing box as a post, listing cards included. The
  rules for it live in `src/lib/posts/post-body.ts`.
- **The address:** unique on its own site. A title typed on a new event writes
  the address until the address is typed in directly, and a clash is numbered,
  like `night-market-2`.
- **Draft or published:** a new event is a draft. A draft is never readable by
  a visitor. Unpublishing is setting it back to Draft.
- **Public or private:** a new event is public. "Private events" below covers
  the other kind.
- **The published date:** set the first time an event is published and kept
  after that. It is not shown anywhere yet.
- **Categories:** events use the same categories as listings and posts, filed
  in `category_relationships` with the content type `event`.
- **Deleting a site** deletes its events. Deleting an event removes its
  category tags too. Deleting a category removes it from its events, and the
  warning before the delete counts events separately from listings and posts.

## The time zone rule

- **An event stores a day and a clock time**, like 26 Sep 2026 and 6:00 PM.
  It never stores one moment in time.
- **The site stores the time zone**, in `directory_settings.time_zone`.
- **Why:** "Saturday 6pm" stays Saturday 6pm when the clocks change in
  November. Changing the site's time zone keeps every event's day and clock
  time as written and reads them in the new zone.
- **Where the zone is used:** deciding whether an event is over, and naming the
  zone on the event page, as in "6:00 PM to 11:00 PM, Eastern Time".
- **The rules live in one file**, `src/lib/events/event-time.ts`. Whether an
  event is over compares the event's end with what a wall clock in the site's
  zone reads now, so the server's own clock never decides it.

## When an event ends

- **With an end time:** it ends at that time on its end day.
- **With no end time:** it ends at midnight at the end of its last day.
- **Past midnight:** an event from 10pm to 2am needs the next day as its end
  day. Admin → Events refuses an end that comes before the start and says so.
- **Several days:** an end day can be later than the start day, like a food
  festival from Friday to Sunday. It is still one event, with one page. "An
  event over several days" below says where it shows.

## Writing an event

- **Where:** Admin → Events, at `/admin/events`.
- **The list:** search by title, address or place, filter by status, sort by
  title, status, event date or last change. It opens on the latest event date
  first, and the Date column shows the event's own start, not when it was
  edited. A private event has a "Private" label beside its status.
- **The window:** the event (title, address, summary, status, who can find it,
  cover image),
  when and where (start day, start time, end day, end time, place, street
  address, or a listing picked as the place), categories and the body. A new event needs a title, a start day and
  a start time before it saves.

## Duplicating an event

Each row in Admin → Events has a Duplicate button before the cog. It is for an
event that happens again on no fixed pattern, like a trivia night most
Thursdays. An event on a fixed pattern is a repeating event instead.

- **One click:** the copy is made and its window opens straight away, so the
  admin can change the date and save.
- **What comes across:** the summary, cover image, body, start and end, place,
  street address, categories and the public or private setting.
- **The new title and address:** " (copy)" goes on the end of the title, so
  "Trivia night" becomes "Trivia night (copy)". The address comes from that
  title, like `trivia-night-copy`, and `trivia-night-copy-2` when that is taken.
- **Always a draft:** the copy has no published date, so nothing new is public
  until the admin publishes it.
- **The original is not touched.** Closing the copy's window without saving
  keeps the copy as a draft. Delete it from the list if it is not wanted.
- **A copy never repeats.** Copying a repeating event copies the event and not
  its repeat or its dates.
- **Where it lives:** `duplicateEvent` in `src/server/events/events.ts`.

## Repeating events

An event can repeat every week on chosen days, or every month on a day like
"the first Tuesday" or "the last Friday", with an optional end day. It is for
something like a trivia night every Thursday: the admin sets it up once, and
the coming Thursdays are always on the calendar.

- **The main event is the first date.** It holds the repeat, in the Repeat
  card of its window. Every later date is its own event, with its own page and
  its own address, like `/events/trivia-night-2026-10-08`.
- **The Repeat card:** "Does not repeat", "Every week" with the days ticked, or
  "Every month" with the week and the day, plus an Until day. It starts from
  the event's own weekday. Under it is the plain sentence, like "Every Tuesday
  and Thursday", and the first four dates, worked out by the same code that
  makes them.
- **The repeat has to fall on the start day.** An event starting on a Thursday
  cannot repeat "Every Tuesday", because the sentence would then describe dates
  that are not the ones made. The card says so, and saving is refused in the
  same words.
- **How far ahead:** the next 8 dates, counting the main event while it is to
  come, and never more than 3 months past today. A weekly event has its next 8
  weeks; a monthly one has its next 3 months.
- **Topping up:** a background job checks every 15 minutes and makes the
  dates that are now due. Saving the main event makes them at once.
- **Never twice:** each date is made for one day of the repeat, and the
  database refuses a second date for the same day, so two runs at once never
  make a date twice. A date the admin deleted is not made again. The next day
  of the repeat takes its place instead.
- **What a date copies:** the title, summary, cover image, body, status, who
  can find it, times, place, street address and categories. An event over
  several days keeps its length on every date.

### Editing a repeating event

- **Editing the main event** changes every future date that was not changed on
  its own. Each keeps its own day and its own address. Past dates are left as
  they were.
- **Editing one date** changes that date only. The date is marked "Changed on
  its own", and later changes to the main event skip it.
- **Changing the repeat or the start day** deletes the future dates that were
  not changed on their own and makes them again from the new repeat. A future
  date that was changed on its own is kept, and a message after saving names
  it, like "Thu, Oct 29 was changed on its own, so it was kept as it is."
- **Stopping:** "Does not repeat" deletes the future dates that were not
  changed on their own and makes no more. The past dates stay, and so does any
  future date changed on its own.
- **Deleting the main event** deletes every date with it, and the warning
  counts them: "Trivia night and its 7 later dates go for good." Deleting one
  date deletes only that date.

### In Admin → Events

- **One row per repeating event.** The dates are not rows. The main event's row
  says "Repeats" beside its status, and under its title "Every Thursday · 7
  more dates coming". After the repeat is stopped it says "No longer repeats ·
  12 later dates". The Date column is the main event's own day.
- **Later dates:** the main event's window lists every later date, soonest
  first, marked "Past", "Draft" or "Changed on its own" where that is true.
  Clicking one swaps the window to that date. With unsaved edits the window
  asks before it swaps.
- **One date's window** has no Repeat card. It says whose date it is and has an
  "Open main event" button.

### On the site

Every date is an ordinary event to a visitor. Each shows in the Events page's
list and month, search, the sitemap, the feed and the calendar subscription,
and each has its own page, calendar file and Google markup.

### Where it lives

- **The rules:** `src/lib/events/event-repeat.ts`, copied from the old
  Directory app with its tests. "The last Friday" in a month with five Fridays
  is the fifth one.
- **Making, copying and clearing dates:** `src/server/events/repeats.ts`.
  `saveEventAndDates` saves an event and its dates in one transaction, so a
  refused repeat leaves nothing half saved. `runRepeatTopUps` is the background
  job, listed in `src/app/server-options.ts`.
- **The columns:** `repeat_rule` and `repeat_made_until` on the main event;
  `series_id`, `series_date` and `edited_alone` on each date.
- **The background job needs a restart to start.** The shell's loop keeps the
  list of jobs it had when the server started, so a server running before this
  change never tops up until it restarts. Saving the main event still makes
  its dates.

## The place is a listing

When the event is at a place that is already a listing on the site, like a bar
hosting a jazz night, the admin picks the listing instead of typing a name and
address. Typing a place by hand still works for places that are not listed.

- **Picking:** "Pick a listing" under the place boxes, in When and where. It
  searches the site's listings by name as you type, the same picker the post
  editor's "Listing card" uses, and marks a draft listing "Draft". Picking one
  fills the Place and Street address boxes with the listing's and greys them
  out.
- **Unpicking:** "Type a place instead" takes the listing off and leaves its
  name and address in the boxes, to change by hand.
- **Always the listing as it is now.** The event page, the Events page's list
  and month, the calendar subscription, a calendar file, Google's event markup,
  search and Admin → Events all read the listing's current name and address.
  Renaming the listing changes all of them at once.
- **The link:** the place's name on the event page links to the listing's
  page. There is no link when the listing is a draft, or while the directory is
  switched off or kept for members, the same rule as a listing card in the
  body. The name and address still show.
- **The listing is deleted:** its last name and address are written onto the
  event just before it goes, so the event page keeps saying where it is, as
  plain text with no link.
- **A copy and a repeating event's dates** keep the same listing.
- **The listing's pin** is the event's map pin, as "The map on the event page"
  below says.
- **Only this site's listings:** saving a listing from another site is
  refused with "That listing is not on this site any more."
- **Where it lives:** `listing_id` on `events`; `livePlaceName` and
  `livePlaceAddress` in `src/server/events/events.ts` are the one rule every
  read uses; `keepListingPlaceOnEvents` runs inside the listings delete. The
  picker is `src/components/directory/listing-picker.tsx`.
- **Not built:** listings have no "permanently closed" state, so there is
  nothing yet to warn an admin about. That question from task 10 waits until
  listings can be marked closed.

## What's on at a listing

A listing's page has a "What's on here" box with the next 3 events held there,
so a visitor looking at a bar sees trivia on Thursday and jazz on Saturday.

- **Which events:** published, public, not over yet, and held at that listing,
  which means picked as the place in the event window. A typed place with the
  same name does not count. A date of a repeating event that was changed on
  its own to another place is not there either.
- **Where:** the wide column, after the write-up and the site's own fields and
  above "Related listings". Tyler chose this on 23 Sep 2026. On a phone it
  comes after the listing card and hours, like the rest of the wide column.
- **What a row shows:** the day in a small square, the title and the day and
  time, the same as a row on the Events page. The place is left out, because
  it is the page the visitor is on. "All times are Eastern Time." sits under
  the heading.
- **See all:** with more than 3 coming up, "See all 8 events here" opens the
  Events page narrowed to that place.
- **No box** when nothing is coming up, and none when the Events page is
  switched off, or kept for members and the visitor is signed out.
- **How fresh:** the listing's own part of the page is cached for up to two
  minutes, but the events are read after that cache, by the site's clock, so a
  new or finished event shows within a minute.
- **Where it lives:** the endpoint for the listing page in
  `src/lib/api/directory/public.ts` adds the box's events, read with
  `readUpcomingEvents` and a listing's id. The box is
  `src/components/directory/public/listing-events.tsx`.

## Events on category pages and the home page

### A category page

A category page lists its upcoming events under its listings, above the posts,
headed "Upcoming events in Live music" with "All times are Eastern Time."
under it.

- **Which events:** published, public, not over yet, and filed under that
  category in the event window. Its own events only, never its subcategories',
  the same rule its listings follow.
- **How many:** the soonest 6, in the Events page's list rows. With more to
  come, "All upcoming events in Food" opens the Events page narrowed to that
  category.
- **No events, no section.** A category holding only events skips its "There
  is nothing in Food yet" card, the same as one holding only posts.
- **Read after the cache** and only when the visitor may see the Events page,
  the same as a listing's "What's on here".

### A home page row

A home page row can be a third kind, "Upcoming events", next to Listings and
Category cards, in Settings → Directory → Front page.

- **Its settings:** a heading, an introduction, a category or "Every event",
  and how many, 1 to 12. Order and arrangement do not apply: it is always the
  soonest first, one under the other, the same rows as the Events page.
- **On the page:** the row's heading, its introduction, "All times are Eastern
  Time.", the events and a "See all events" button to the Events page. A row
  with a category opens the Events page narrowed to it.
- **Left off the page** while nothing is coming up, and while the visitor may
  not see the Events page. A home page left with no rows at all is the
  platform's own front page, as before.
- **Always current.** The home page's rows are cached until the admin saves a
  row, but a row of events is filled after that cache by the site's clock, so
  a finished event is gone within a minute.
- **The saved kind:** `drizzle/0088_cms_front_page_events_row.sql` adds
  `events` to the kinds a row may be. Rows saved before keep theirs. Only the
  heading, introduction, category and count mean anything on a row of events;
  the order and arrangement are stored but not used.
- **Where it lives:** `fillFrontPageEvents` in
  `src/server/directory/front-page.ts`, the kind in
  `src/lib/directory/front-page.ts`, and the "Which events" card in
  `src/components/directory/front-page-section-dialog.tsx`. Both lists read
  `readUpcomingEvents` with a category.

## The map on the event page

An event page shows a small map of where the event is, with one pin, and a
"Directions" button that opens Google Maps with the place as the destination.
On a phone that opens the maps app, ready for walking directions.

- **Where the pin comes from:** a listing picked as the place brings its own
  pin, and nothing is looked up. A typed street address is looked up with
  Google once, when the event is saved.
- **Only when the address changes.** The address last looked up is kept in
  `located_for`, so saving again without changing the address makes no
  lookup. Each lookup counts against the site's Google allowance, so this is
  the rule that keeps the cost down.
- **Only the street address is looked up**, never the place name alone. A name
  like "The Local" could match a bar in another city, and a pin in the wrong
  place is worse than none.
- **Google finds nothing:** the event has no map, and the same address is not
  asked about again until it is changed.
- **Google cannot be reached, or the site has no lookup key:** the event has no
  map, and the next save tries again.
- **No map is still a working page.** The place is written out above where the
  map would be, and Directions works from the name and address instead of a
  pin.
- **Which keys:** both are in Settings → Directory. The lookup uses "Google
  Maps API key" on the Near me search card, and drawing the map uses "Map
  display key" on the Map view card. They are the same two keys the
  directory's place search and map use. With no display key there is no map,
  only Directions.
- **The window says where it stands.** Under a typed street address, the event
  window says "On the map on the event page", "Google could not find this
  address…", "The address is looked up for the map when you save" or "No map:
  this site has no Google Maps API key under Near me search".
- **Directions hides once the event is over,** with "Add to calendar". The map
  stays, as a record of where it was.
- **A deleted listing** leaves its pin on the event with its address, so the
  map stays and nothing is looked up.
- **A copy and a repeating event's dates** keep the pin, with no new lookup.
- **Where it lives:** `positionForSave` in `src/server/events/events.ts`
  decides whether a save looks anything up, and runs before the save's
  database transaction so a slow answer never holds the database.
  `locateAddress` in `src/server/directory/geocode.ts` asks Google. The map is
  `src/components/events/public/event-place-map.tsx`, and the link is
  `src/lib/events/directions.ts`.
- **One rule for the pin:** `livePlaceLatitude` and `livePlaceLongitude` in
  `src/server/events/place.ts` decide it for the event page's map and for
  "Events near a place" on the Events page.
- **Not built:** a map of all events. An online event (task 29) will have no
  map.

## Private events

A private event has a page anyone with the link can open, and no list on the
site shows it. It is for something like a members' dinner whose link goes out
by email. It is not a password.

- **The switch:** "Who can find it" in the event window, Public or "Private,
  link only". It can be changed at any time, on a draft or a published event.
- **Left out of:** the Events page's list, the month, one day's list, the
  whole-site search, the search box's suggestions, the sitemap, the feed and
  the calendar subscription.
- **Still working:** the event's own page, its "Add to calendar" file and its
  drawn share card. The share card is the preview of the very link the event
  is sent by, so it stays.
- **Search engines:** a private event's page carries
  `<meta name="robots" content="noindex">`, which asks them not to list it.
  Switching the event back to Public removes the tag.
- **The Events page's switch still counts.** With the Events page off, a
  private event's page is not found either, the same as every event page.
- **One filter for every list:** every public list of events filters through
  `listedEventsOnSite` in `src/server/events/public.ts`. Only reading one event
  by its address skips it. The old Directory app let each list check for
  itself, and only search remembered.
- **The test that keeps it that way:** `src/server/events/private.test.ts`
  runs every function `public.ts` exports and fails if one shows a private
  event, or if a new export is missing from its list. It also fails if any
  file besides the admin code, `public.ts` and the share card reads the events
  table, so a new list has to be written in `public.ts`.

## The event page

- **`/events/<address>`** shows the cover image, title, category links,
  summary, when, where and the body. Its tab title, description and share image
  come from the event.
- **"This event has ended"** shows at the top once the event is over by the
  site's clock. The page works this out on every visit, after the page cache,
  so a cached page never says an event is still on.
- **A draft, another site's event and a made-up address** all answer the same
  not-found page.

## The Events page

`/events` is what is on. It opens on the list, and a switch above it changes to
the month. The view, the month, a chosen day and the filters all live in the
address, so a shared link opens the same view.

- **Private events** are in none of these views.
- **The list:** events that are not over yet, soonest first, 12 to a page. An
  event that ended an hour ago is gone. One still running, or with no end time
  on today, stays until it is over. A festival stays until its last day ends.
- **One place:** `?place=the-rex` narrows the list to the events held at that
  listing, headed "At The Rex" with a link back to the listing and "All
  upcoming events" to clear it. The name is plain text while the directory is
  switched off or kept for members, the same rule as an event page's place. Paging keeps the place. Only a published
  listing on this site is found this way; any other address shows every
  event. Switching to the month drops the place.
- **The month:** `?view=month&month=2026-10`. Previous and next move a month,
  Today goes back to the site's current month, and the site's today has a ring.
  Each day shows up to three events and "+2 more". Events that are over still
  show, because a month is a record of what happened.
- **One day:** `?day=2026-10-03`, reached from "+2 more" or a day on a phone.
  It shows every event on that day, soonest first, festivals that started on
  an earlier day included. Ones that are over are
  marked "Ended", so a past day is never an empty page. It is not paged.
- **On a phone** the month is a small grid of day numbers with a dot on days
  that have events. Tapping a day with a dot opens that day.
- **Whose today:** "today" and "now" are the site's own clock, read in its time
  zone by the server on every visit and handed to the page. The visitor's clock
  is never asked, so a visitor in Vancouver sees the same today as one in
  Toronto.
- **The zone** is named once under the heading: "All times are Eastern Time."
- **The helpers** for the grid are copied from the old Directory app with their
  tests, in `src/lib/events/calendar-grid.ts`.

### Filters on the Events page

A visitor narrows the page by category and by date. A visitor after food this
weekend taps "Food", then "This weekend", and the list shows only that. Every
filter sits in the address, like `/events?category=food&when=weekend`, so a
reload keeps it and a shared link opens the same list.

- **The category chips:** "All", then one chip per category with at least one
  published public event filed under it, in the order set on the Categories
  screen. A category holding only drafts or private events gets no chip, so a
  chip never gives either away. Past events count, because the month shows
  them.
- **A category's own events only,** never its subcategories', the same rule a
  category page follows.
- **The category follows every view.** The list, the month, one day, the
  months either side, Today, a day opened from the month, and the List and
  Month switch all keep it.
- **The date chips,** on the upcoming list only: "Any time", "Today", "This
  weekend" and "Next 7 days". Beside them, From and To pick a range with the
  same date picker as Admin → Events. One end alone works too: From alone is
  that day onwards, To alone is up to that day.
- **What each date chip covers,** by the site's calendar, never the visitor's:
  - Today is the rest of today.
  - Next 7 days is today and the six days after it.
  - This weekend is Saturday and Sunday. From Monday to Friday that is the
    coming Saturday and Sunday. On Saturday it is today and tomorrow. On
    Sunday it is the rest of Sunday, never the weekend after, as task 14
    suggested.
- **Which events a date filter keeps:** any event with a day inside the
  dates, so a festival running from Friday to Monday is in "This weekend".
  The list still holds only events that are not over, so an event that ended
  an hour ago is gone even from "Today".
- **The date filter stays with the list.** Switching to the month drops it, and
  so does opening one day, because both already are a stretch of dates.
  Picking a category keeps the date filter, and picking a date keeps the
  category and the place. Either one goes back to page 1.
- **The empty card says what was asked:** "Nothing is on this weekend in
  Chinese.", "Nothing in Food is on in October 2026." or "Nothing is coming up
  at The Rex."
- **An odd address shows the page, not an error.** A category that is not
  here shows every event, a date word it does not know is dropped, a range
  typed backwards is read the right way round, and "Today" wins over a range
  when both are in the address.
- **A category page's link** under its events reads "All upcoming events in
  Food" and opens the Events page on that category. A home page row of events
  with a category does the same with its "See all events" button.
- **Not built:** free or paid, which waits for paid tickets (task 32), and the
  site's extra fields (task 07) as filters, which is Tyler's call once task 07
  exists.
- **Where it lives:** the address and the date rules in
  `src/lib/events/events-page.ts` (`readEventsSearch`, `eventDateWindow`), the
  chips in `src/components/events/public/event-filters.tsx`, the chips' look
  shared with the directory in
  `src/components/directory/public/filter-chip.ts`, and the reads in
  `src/server/events/public.ts` (`readEventCategories`, and a category and
  dates on `readUpcomingEvents` and `readEventsBetween`). "This weekend" has a
  test for each day of the week in `src/lib/events/events-page.test.ts`.

### Events near a place

A visitor on a phone can ask for what is on near them tonight. Under the date
chips on the upcoming list sit the same Near and Within controls the
directory's listings use: a town or postcode with "Search place", "Use my
location", and Within 5, 10, 25 or 50 km. Tapping "Today" and "Use my
location" gives tonight's events within 10 km.

- **The same picker as listings.** `NearPicker` in
  `src/components/directory/public/near-picker.tsx` is the one both pages draw,
  so Within stays disabled with "Pick a location first." until a place is
  found, on both. `directory-radius.md` has that rule.
- **In the address:** `?near=43.653,-79.384&radius=5&area=Toronto`. The point
  is rounded to about 110 metres, the same as the directory's, so a shared link
  never gives away a doorstep. `area` names the place for the page's words;
  `place` already means a listing on this page, so it needed another word.
- **Where an event is:** the pin on its event page. A listing picked as the
  place brings the listing's pin, and a typed street address brings the one
  Google found for it, as "The map on the event page" above says.
- **No position, not listed.** An event with no pin, like one with only a place
  name, one Google could not find, or one at a listing with no pin, is left out
  while the filter is on. The page says so under the controls: "Showing events
  within 5 km of Toronto, ON, Canada. Events with no place on the map are left
  out."
- **Still soonest first.** The distance narrows the list and does not reorder
  it, because the question is what is on soon nearby. Each row adds how far
  away it is beside the place, like "The Rex · 2.3 km away".
- **Measured the same as listings.** `distanceKmFrom` in
  `src/server/directory/distance.ts` is the one formula for both, so 5 km on
  the Events page is 5 km in the directory.
- **It stays with the list.** Picking a category, a date chip or a From and To
  day keeps the distance, and picking a place keeps the dates. Paging keeps it
  too. Switching to the month or opening one day drops it, the same as the
  date filter. "Clear location" drops only the distance.
- **The empty card says it:** "Nothing is on today within 5 km of your
  location."
- **An odd address shows the page.** A point that is not a real latitude and
  longitude drops the filter. A distance the picker does not offer, like
  `radius=7`, is read as 10 km.
- **Place search needs the site's key.** "Search place" uses "Google Maps API
  key" on the Near me search card in Settings → Directory, the same key the
  directory uses. Without it the page says "Place search is not available on
  this site yet. Use your location instead." "Use my location" works either
  way.
- **Where it lives:** the address in `readEventNear` and `eventNearText` in
  `src/lib/events/events-page.ts`, the read in `readUpcomingEvents` in
  `src/server/events/public.ts`, and the live pin in `livePlaceLatitude` and
  `livePlaceLongitude` in `src/server/events/place.ts`, which the event page's
  map reads too.

## An event over several days

A festival from Fri 30 Oct to Sun 1 Nov is entered once and has one page. It
is not different hours on each day. A festival with different hours each day
is three events, or a repeating event.

- **The event page:** the day line names both days, "Friday, October 30 to
  Sunday, November 1, 2026", with the year said once when both days share it.
  The time line reads "Starts 12:00 PM, ends 8:00 PM, Eastern Time". A one-day
  event still reads as one day.
- **A row in the list:** each time sits beside its own day, "Fri, Oct 30,
  12:00 PM to Sun, Nov 1, 8:00 PM", because the times are when the festival
  starts and ends, not its hours on each day. A one-day row still reads
  "Sat, Sep 26 · 6:00 PM to 11:00 PM". The date square on the left is the
  first day.
- **The month:** the festival is on every day it covers. The start time shows
  on its first day only. A festival across a month's end shows in both months,
  so 30 and 31 Oct are in October and 1 Nov is in November. On a phone each of
  those days gets a dot.
- **Order within a day:** a festival that started on an earlier day sits above
  the events that start on the day, because it is already running.
- **Leaving the lists:** it stays in the upcoming list, the calendar
  subscription and the search box's suggestions until its last day ends. The
  sitemap counts its 30 days from the last day too.
- **The calendar file and Google:** both carry the real start and the real end,
  so a calendar app shows one block from noon Friday to 8pm Sunday.
- **Where the rules live:** `daysCovered` in `src/lib/events/calendar-grid.ts`
  lists the days an event covers inside one grid. `readEventsBetween` in
  `src/server/events/public.ts` finds every event with any day inside the grid,
  not only the ones that start in it. `eventRowText` and `eventWhenLines` in
  `src/lib/events/event-time.ts` write the words.
- **Sign-ups:** once sign-ups exist (task 24), one sign-up covers the whole
  festival. A ticket for one day would be a ticket type (task 33).

## The Events page's on/off switch

`/events` is a page on the Pages screen, so it can be switched off or kept for
members like any other page. Every event's page follows the same switch.

- **Switched off:** `/events` and every event page are not found.
- **Members only:** a signed-out visitor is sent to sign in, then back to
  `/events`.
- **How fast:** the pages follow a switch change at once, and saving an event
  clears the public page cache, so an edit shows at once too. The upcoming list
  is read again at least once a minute, which is how an event drops off as it
  ends.

## Where events appear

A published public event appears in all of these. A draft or a private event
appears in none of them. All of them also need the Events page open to
everyone. Switched off or kept for members, events leave search, the suggestions, the sitemap, the feed and the
drawn share card, the same rule posts follow.

- **Whole-site search at `/search`:** matches the title, summary, place name
  and body words, labelled "Event". Past events are found too.
- **The directory's search box:** from two letters, up to 3 events that are not
  over yet, soonest first, matched on title and summary. They come after the
  categories and listings, with the start day on the right, like
  "Sat, Sep 26". The arrows, Enter and Escape work on them the same as on a
  listing. `directory-search-suggestions.md` covers the box.
- **The sitemap:** every published event in the flat part at
  `/sitemap.xml?part=pages`, until 30 days after its last day by the site's
  calendar. An event on 27 Aug is still there on 26 Sep and gone on 27 Sep.
- **The feed at `/feed.xml`:** mixed in with listings and posts by the day it
  was published, 20 entries in all. The feed is now called "New listings,
  posts and events".
- **How fast the switch reaches them:** search, the suggestions and the
  sitemap follow a Pages switch change at once. The feed and the share card
  can take up to two minutes, because the public page cache holds them that
  long and the Pages screen belongs to the shell, which does not clear it.

## Google's event markup

Each event page carries a block Google reads to show the event in its event
listings. It is written by `eventJsonLd` in `src/lib/directory/public-seo.ts`.

- **What it says:** the name, the address of the page, the start, the end, the
  place, the summary, a picture, and the site as the organiser.
- **Times carry the site's offset on that day.** 6pm on 26 Sep 2026 in Toronto
  goes out as `2026-09-26T18:00:00-04:00`, and 6pm on 7 Nov as `-05:00`,
  because the clocks go back on 1 Nov. The helper is `eventMomentText` in
  `src/lib/events/event-time.ts`.
- **The end:** an end day and time go out as one moment. An end day with no
  time goes out as the day alone. No end at all means no end in the block.
- **The place:** the place name and the street address. With a place name and
  no street address, the name is sent as the address too, because Google needs
  an address and that is the only one the admin gave.
- **No price yet.** Events have no price until paid tickets (task 32) exist.
- **It always says "scheduled" and "in person".** Cancelled events (task 27)
  and online events (task 29) change that later.
- **The picture** is the cover photo, or the drawn share card when there is
  none.

## The share card

An event with no cover photo is shared with a drawn card, the same card a
listing gets, with the date where a listing shows its category, like
"SAT, SEP 26 · 6:00 PM". An event over several days shows "SAT, SEP 26 TO MON,
SEP 28" instead, because the time would not fit.

- **Where:** `/events/share-image/<address>?v=<version>`. The version changes
  whenever the title, date, site name, site colour or the event changes, so a
  link preview never keeps an old card.
- **An old or missing version** is sent on to the current one.
- **A draft, another site's event, or an Events page not open to everyone**
  answers not found.
- **One visitor may ask 120 times a minute**, the same limit as listing cards.

## Adding an event to a calendar

Each event page has an "Add to calendar" button, and the Events page has a
"Subscribe" button. Both open a short menu with Google Calendar and "Apple
Calendar or Outlook". The builders live in `src/lib/events/calendar-file.ts`.

- **One event:** Google opens its new-event form filled in, in a new tab. The
  other choice downloads `/events/<address>/calendar.ics`, which a phone or a
  computer opens in its own calendar app.
- **Once an event is over,** the page has no "Add to calendar" button.
- **Subscribe:** Google opens its "Add calendar" prompt. The other choice is a
  `webcal://` link to `/events.ics`, which hands the address to the phone's or
  computer's calendar app. After that, every event the site publishes shows up
  in the visitor's calendar by itself.
- **What the subscription holds:** every published public event that is not
  over yet, soonest first, 500 at most. An event drops out of it once it is over, so it
  also leaves the subscriber's calendar at the next check.
- **How fast a new event arrives:** Apple Calendar and Outlook are asked to
  check every 6 hours. Google checks on its own timetable, usually within a
  day, and ignores the request.
- **Google's subscribe choice needs a real address.** Google fetches the file
  from its own servers, so it cannot reach a site running on this computer.

### Times in a calendar

- **Every time goes out as one exact moment**, worked out from the event's day
  and clock time in the site's time zone on that day. 6pm on 26 Sep in
  Toronto goes out as 10pm UTC, and 6pm on 7 Nov as 11pm UTC, because the
  clocks go back on 1 Nov. The visitor's calendar then shows it at their own
  local time, which is 6pm for somebody in Toronto.
- **The end is the event's real end.** With no end time, it runs to midnight
  at the end of its last day, the same moment the site counts it as over. A
  6pm event with no end time is 6pm to midnight in the calendar.
- **Google's form** is also told the site's zone, so it shows the times the
  way the event page does.
- **Each event keeps the same id in every file**, so adding it a second time
  updates it instead of making a copy.

### Who can get the files

- **One event's file** follows the event page's rule. With the Events page
  kept for members, a signed-in member can download it and a signed-out
  visitor gets not found.
- **The subscription** exists only while the Events page is open to everyone,
  because a calendar app asking for it is never signed in. Switched off or kept
  for members, `/events.ics` is not found and the Events page has no Subscribe
  button.
- **A draft, another site's event and a made-up address** all get not found,
  the same as the page.

## Suggested events

Anybody can suggest an event at `/add-event`, like a band that used to email
the site owner about every gig. The suggestion waits in Admin → Event
suggestions, at `/admin/event-submissions`, until an admin says yes or no.
Yes makes a draft event. The person is emailed either way.

The queue has no sidebar link of its own, the same rule as Events. Add it to
the sidebar in Settings, or open it from the link in the email admins get
about each new suggestion.

### The form

- **Where:** `/add-event`, reached from the "Suggest an event" button beside
  Subscribe on the Events page. The button shows only while the Suggest an
  event page is open to the visitor.
- **Two switches:** the page follows its own switch on the Pages screen and
  the Events page's. With either off, the page is not found and its endpoint
  refuses a send, so a direct call cannot get round it.
- **The boxes:** the name of the event, a description, a photo, the day, a
  start and an end time, the place, the street address, and the person's name
  and email. The name, the day, the start time and the email are required.
- **The day:** the same date picker as Admin → Events. A day before the site's
  today is refused with "That day has already been. Pick today or a later
  day." Today itself is fine. "Today" is the site's calendar, never the
  visitor's.
- **Past midnight:** an end time earlier than the start time means the next
  day, so a gig from 9:00 PM to 1:00 AM is typed as it is said. The hint on
  Ends says so. An end time equal to the start time is refused.
- **The photo:** one JPG, PNG or WebP up to 5 MB. The box is the form's own,
  drawn like the shared image box, because that one needs an account. The
  photo stays in the browser until Send. It shows only while the site has file
  storage set up in Settings → Storage.
- **The check is shared.** `eventSubmissionProblems` in
  `src/lib/events/event-submission-fields.ts` is what the form shows under each
  box and what the server refuses with. The old Directory app checked its
  required boxes in the browser only.
- **After Send:** "Thank you", naming the event and the email the answer goes
  to, with "Suggest another event", which keeps the name and email, and "Back
  to events".

### Spam

- **A hidden box:** the form has a box no person sees or reaches. A bot fills
  every box, and a send with that one filled is told it worked and is thrown
  away.
- **Five an hour:** one internet address may send five suggestions an hour to
  one site. The sixth is refused with "You have sent 5 events in the last hour,
  which is as many as this site takes. Please try again in an hour." Another
  site, or another address, has its own five.
- **A refused answer does not count.** A day that has been, or a missing email,
  is refused before the five are counted, so fixing a typo costs nothing.
- **A double click is one suggestion.** The same title from the same email
  inside a day, while the first is still waiting, writes nothing new and says
  it arrived.
- **Admins are emailed** about each new suggestion, with a link to the queue,
  the same way as a new listing. A failed email to them never fails the send.

### The queue

- **Three tabs:** Pending, which it opens on and which shows how many are
  waiting, Approved and Rejected, with a search over the event's name, the
  email, the person's name and the place, so an owner's events are found by
  their listing's name. The tab, the search and an open suggestion all
  live in the address.
- **No selection column,** the same as Listing submissions: approving in bulk
  would make events nobody read.
- **The window** shows everything that was sent, the photo included, and a
  note back. Pending ones end with Cancel, Reject and "Approve as a draft", or
  "Approve and publish" for a listing owner's. Decided ones open read-only
  with Done, the note that was sent, and "Open the event" for an approved one.
  The row's "The event" does the same.
- **A listing owner's event** is marked "From the owner" on its row, with the
  listing under its name, and the window says who sent it and that approving
  publishes it. "Events from a listing's owner" below covers them.

### Approving and rejecting

- **Approving a public suggestion makes a draft event with every field
  filled:** the title, the day and times, the place, the street address, the
  description as the body, its first paragraph as the summary, and the photo
  as the cover. Nothing is public until an admin publishes it. A listing
  owner's is published instead, as "Events from a listing's owner" says.
- **The photo joins the Media library** on approval, under the admin who
  approved it. Until then it waits in the site's storage under
  `event-submissions/`, which the Media screen's orphan scan leaves alone
  because it is not a person's folder. The person who sent it is never told
  where it is kept.
- **No map lookup on approval.** The street address is looked up the first time
  the admin saves the draft in the event window, as "The map on the event page"
  says.
- **Once only.** Approving twice, or two admins at the same moment, makes one
  event. The second is told "Somebody has already dealt with this one."
- **Rejecting** keeps the suggestion as a record with its note, makes nothing,
  and deletes the photo from storage.
- **Only this site's.** A suggestion sent to one site is never in another
  site's queue and cannot be decided from it.

### The email back

The same rule as a listing's, in `submission-review-email.md`: the decision is
saved first, and a failed email never undoes it.

- **Approved:** "<title> has been accepted", saying it will be on the Events
  page once it is published, with the admin's note if there is one.
- **Rejected:** "About your event, <title>", with the admin's note, or "If you
  think this is a mistake, reply to this email." when there is none.
- **The admin is told which happened:** "Approved. The event is saved as a
  draft and the sender has been emailed." in green, or "…but the email to the
  sender could not be sent." in amber. A local site with no Resend key always
  shows the amber one.

### Events from a listing's owner

The owner of a claimed listing adds events at their own place from My
listings, like a café adding its Friday open mic, without emailing anyone.
They go into the same queue, and every one is read by an admin.

- **Where:** each listing on My listings has an "Events at Café Luna" card
  under it, with "Add event". The card lists the events that account sent for
  that listing, newest first, 20 at most.
- **The window:** the name of the event, a description, a photo, the day, and
  a start and an end time, with the same check and the same past-midnight rule
  as the Suggest an event page. The place is not a box: it says "Café Luna.
  Your events are always at your listing." The name and email are the
  account's.
- **The photo** is the shared image box, because an owner has an account. It
  goes into their own Media library, and the server refuses a picture that is
  not one of theirs.
- **Only their own listing.** The listing comes from the owner's approved
  claim, found by the claim and the account together, so another owner's
  claim, or a claim still waiting, is refused with "You do not look after that
  listing."
- **The Events page's switch counts.** While the site has its Events page off,
  the card says so and has no "Add event", and the server refuses a send.
- **Twenty an hour** from one owner, more than the public's five, because
  filling in a month of nights is ordinary and each one still waits for an
  admin.
- **Admins are emailed** with "New event from the owner of Café Luna" and a
  link to the queue.
- **Approving publishes it,** with the listing as the place, so the event page
  links to the listing and uses its pin, and it is on the Events page at once.
  The owner is emailed "<title> is on the Events page". Rejecting emails the
  note, the same as a public suggestion.
- **What the owner sees:** each event with "Waiting for approval", "Approved"
  with "See its page", or "Not approved" with the admin's note.
- **Only their own.** An owner sees the events their own account sent, never
  another owner's. A listing that changes hands shows its new owner none of
  the old owner's events.
- **Where it lives:** `drizzle/0090_cms_owner_event_submissions.sql` adds
  `from_owner`, `owner_user_id`, `listing_id` and `cover_image` to
  `event_submissions`. `sendOwnerEvent` and `ownerEventsFor` are in
  `src/server/events/owner-submissions.ts`, and the card and window are
  `src/components/events/owner-events.tsx`.

### Where it lives

- **The table:** `event_submissions`, from
  `drizzle/0089_cms_event_submissions.sql`.
- **The rules:** `src/server/events/submissions.ts` (`createEventSubmission`,
  `reviewEventSubmission`, and `decideEventSubmission` for the decision and the
  email together). The boxes and the check:
  `src/lib/events/event-submission-fields.ts`.
- **The doors:** `src/lib/api/events/submissions.ts`, with the two public ones
  written down in `src/app/open-endpoints.ts`.
- **The screens:** `src/routes/add-event.tsx` with
  `src/components/events/public/event-submission-form.tsx`, and
  `src/routes/_authenticated/admin/event-submissions.tsx` with
  `src/components/events/event-submissions-dashboard.tsx` and
  `event-submission-dialog.tsx`.
- **Not built:** the person cannot change or withdraw a suggestion after
  sending it, and has no account, as task 16 said. A site deleted with
  suggestions still waiting leaves their photos in storage.

## Not built yet

These are later tasks in `workspace/tasks/events/`: sign-ups, and a free or
paid filter once paid tickets exist. Task 07, the site's own extra fields, is not built either. When
it is, those fields need copying to a repeating event's dates like the rest.
