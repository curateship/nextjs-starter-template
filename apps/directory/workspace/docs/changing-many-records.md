# Changing many records at once

Tick several rows on Listings, Events, Posts or Promotions and change them
together. Deleting many already worked this way. Now setting a category,
publishing, unpublishing and featuring do too.

The case it was built for: a site splits Restaurants into Restaurants and Cafés,
and forty listings have to move. That used to be forty windows opened, changed
and saved.

## Where it is

The **Change** button sits in each dashboard's toolbar, to the left of Delete.
It appears the moment one row is ticked and is gone again when none are. It is
never on screen greyed out. The component is
`src/components/shared/bulk-change-menu.tsx`, and all four dashboards use that
one copy of it.

## What each screen offers

| Screen | Set a category | Publish and unpublish | Feature |
| --- | --- | --- | --- |
| Listings | yes | yes | no |
| Events | yes | yes | yes |
| Posts | yes | yes | no |
| Promotions | no | yes | no |

- **Deals have no categories.** A deal is filed under its listing, not under the
  site's categories, so the action is missing from that menu rather than
  present and doing nothing.
- **Featuring a listing costs money.** A listing's featured spot is a paid
  placement held in `directory_featured_entitlements`, and nothing on a
  dashboard may create or end one. Listings therefore have no bulk Feature.
- **An event's featured switch is free.** It is the `featured` column an admin
  sets by hand, separate from a listing owner's paid spot. The bulk switch
  writes only that column. `src/server/events/events.ts` holds
  `setEventsFeatured`, and its test proves no entitlement row is written.

## Every action asks first

A wrong bulk change is as hard to undo as a wrong bulk delete, because nothing
records what each row held before it. So every action goes through a
confirmation that names the count and the exact change: "Publish 40 listings?",
"Stop featuring 12 events?".

The question stays on screen with a spinner until the change has actually gone
through, the way Delete beside it does, so a batch of forty does not look like
nothing happened. A failure leaves the question up to be pressed again.

Setting a category is its own window rather than a picker followed by a
confirmation, because a modal over a modal is worse than one window that says
everything. It holds the category, the choice between adding and replacing, and
a button that names both: "Add Cafés to 40 listings", or "Replace the categories
on 40 listings".

## Add or replace

The two are different actions and the window says which is running.

- **Add** files the records under the chosen category and leaves the categories
  they already have. A listing's primary category, the one its breadcrumb
  names, is left as it was. A listing with no categories at all gets the new
  one as its primary, because there is no other candidate.
- **Replace** leaves each record filed under the chosen category and nothing
  else. On a listing that one row becomes the primary.

A record already filed the asked-for way is counted as unchanged. Nothing is
written to it and it is not reported as a failure.

## What the result says

One line, through `describeBulkResult` in `src/lib/format/bulk-result.ts`:

> 36 listings published, 3 were already published, 1 could not be published.

Three piles, and the wording is chosen so all three read correctly. That is why
switching featuring off reports "taken off the featured list" rather than
"unfeatured", and why a replace says "filed under Cafés only". The word "only"
is what tells the two category actions apart afterwards.

When something was refused, a second message names it: "Joe's Diner could not be
changed: it no longer exists." The refused rows stay ticked, so what is still
selected is exactly what that message is about. A run that changed nothing at
all is reported as a failure, not as a success line reading "0 listings
published".

## What can be refused

Only one thing today: the record is gone. Somebody deleted it between the list
loading and the button being pressed. The rest of the batch still goes through.

Publishing is deliberately **not** blocked for a half-finished record. Nothing
in the app stops a single save from publishing one, so a bulk publish refusing
where the window allows would be two different rules for the same act. In
particular a deal at a draft listing publishes normally: the Deals page only
shows deals at published listings, so the deal waits for its listing, and the
row already says "Listing is a draft". Publishing the deals and then the listing
is the usual order of work.

## Repeating events

The Events screen lists main events only; a repeat's later dates open from the
main event's window. A status or category change made from the action bar is
copied onto the future dates that still follow their main event. Dates already
past, and dates an admin saved by themselves, are left alone. That is the same
rule editing the main event in its window follows.

Both halves happen in one transaction, in `changeEventsAndDates` in
`src/server/events/repeats.ts`. They cannot be allowed to come apart. If the copy
failed on its own, the main events would be changed and their dates left behind,
and pressing the button again would not repair it: the mains already match, so
nothing would count as changed and there would be nothing to copy.

The featured switch is not copied, because a date has no flag of its own and
reads its main event's.

## How it is put together

- **One request for the whole selection.** Each screen has one door:
  `changeListings`, `changeEvents`, `changePosts`, `changePromotions`. Each
  takes the ids and one change object, and each is admin-guarded like every
  other write.
- **Each door takes only what its screen offers.** The Promotions door accepts a
  status change and nothing else; Listings and Posts accept status and category;
  only Events accepts featured.
- **Every write is scoped to the site.** An id from another site comes back as
  refused, not changed, and the same holds for a category from another site,
  which refuses the whole action in words.
- **The counting lives in one place**, `countBulkChange` in
  `src/lib/bulk-change.ts`. Anything asked for that neither changed nor was
  already that way is gone, and that is what makes the three piles add up to
  the number of rows that were ticked.
