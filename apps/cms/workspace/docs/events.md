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

## What an event is

- **The table:** `events`, from `drizzle/0083_cms_events.sql`. An event has a
  title, an address, a cover image, a summary, a body, a status, a start day
  and time, an optional end day and time, a place name and a street address.
- **The body:** the same writing box as a post, listing cards included. The
  rules for it live in `src/lib/posts/post-body.ts`.
- **The address:** unique on its own site. A title typed on a new event writes
  the address until the address is typed in directly, and a clash is numbered,
  like `night-market-2`.
- **Draft or published:** a new event is a draft. A draft is never readable by
  a visitor. Unpublishing is setting it back to Draft.
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
  edited.
- **The window:** the event (title, address, summary, status, cover image),
  when and where (start day, start time, end day, end time, place, street
  address), categories and the body. A new event needs a title, a start day and
  a start time before it saves.

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

## Not built yet

These are later tasks in `workspace/tasks/events/`: filters on the Events page,
search, the sitemap and feed, Google's event markup, sign-ups and repeats.
