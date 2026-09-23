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

## What an event is

- **The table:** `events`, from `drizzle/0083_cms_events.sql`. An event has a
  title, an address, a cover image, a summary, a body, a status, a start day
  and time, an optional end day and time, a place name and a street address.
  `drizzle/0084_cms_events_visibility.sql` adds `visibility`, which is
  `public` or `private`. Every event made before it is public.
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
- **Several days:** an end day can be later than the start day. The page then
  shows both days. The calendar and lists that task 08 adds are not built.

## Writing an event

- **Where:** Admin → Events, at `/admin/events`.
- **The list:** search by title, address or place, filter by status, sort by
  title, status, event date or last change. It opens on the latest event date
  first, and the Date column shows the event's own start, not when it was
  edited. A private event has a "Private" label beside its status.
- **The window:** the event (title, address, summary, status, who can find it,
  cover image),
  when and where (start day, start time, end day, end time, place, street
  address), categories and the body. A new event needs a title, a start day and
  a start time before it saves.

## Duplicating an event

Each row in Admin → Events has a Duplicate button before the cog. It is for an
event that happens again on no fixed pattern, like a trivia night most
Thursdays. Repeating events are task 09.

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
- **Where it lives:** `duplicateEvent` in `src/server/events/events.ts`.

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
the month. The view, the month and a chosen day all live in the address, so a
shared link opens the same view.

- **Private events** are in none of these views.
- **The list:** events that are not over yet, soonest first, 12 to a page. An
  event that ended an hour ago is gone. One still running, or with no end time
  on today, stays until it is over.
- **The month:** `?view=month&month=2026-10`. Previous and next move a month,
  Today goes back to the site's current month, and the site's today has a ring.
  Each day shows up to three events and "+2 more". Events that are over still
  show, because a month is a record of what happened.
- **One day:** `?day=2026-10-03`, reached from "+2 more" or a day on a phone.
  It shows every event starting that day, soonest first. Ones that are over are
  marked "Ended", so a past day is never an empty page. It is not paged.
- **On a phone** the month is a small grid of day numbers with a dot on days
  that have events. Tapping a day with a dot opens that day.
- **Whose today:** "today" and "now" are the site's own clock, read in its time
  zone by the server on every visit and handed to the page. The visitor's clock
  is never asked, so a visitor in Vancouver sees the same today as one in
  Toronto.
- **The zone** is named once under the heading: "All times are Eastern Time."
- **An event on several days** shows on its first day only in the month, and a
  day's list holds the events that start that day. Task 08 changes both.
- **The helpers** for the grid are copied from the old Directory app with their
  tests, in `src/lib/events/calendar-grid.ts`.

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

## Not built yet

These are later tasks in `workspace/tasks/events/`: filters on the Events page,
sign-ups and repeats.
