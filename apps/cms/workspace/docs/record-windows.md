# The four record windows

Listings, events, posts and deals each open as a window over their list. They
are four separate files, but three things in them are the same thing and are
kept the same on purpose: the link to the public page, the categories field, and
the cover image. A listing's window is the one the other three follow.

## The link to the public page

Beside the title, after the Published or Draft badge, sits an icon that opens
that record's public page in a new tab. Tyler asked for it on 25 Sep 2026.
`src/components/shared/record-preview-link.tsx` draws it for all four windows.

- **It points at the saved address, never the typed one.** An address edited in
  the form and not yet saved is not a page yet, so the link would open "not
  found". `/directory/joes-diner`, `/events/porch-sale`, `/posts/<slug>` and
  `/deals/<slug>` are the four shapes.
- **A draft has no public page, so the icon says so instead of opening one.** A
  draft's address answers "not found" to everybody, an admin included. The icon
  is still there and still pressable, and pressing it puts "A draft has no
  public page. Publish the event and the link opens it." in an error toast. It
  is never greyed out, because a greyed-out button cannot explain itself.
- **A record being created has no icon at all**, because there is nothing saved
  to look at.

## Categories

Categories are chosen in a combobox: a box holding one chip per chosen
category, and a list that typing narrows.
`src/components/directory/category-combobox.tsx` draws it in all three windows
that file things under categories, which are listings, posts and events. It
replaced a column of checkboxes on 25 Sep 2026.

- **Why it changed.** Eat Drink Toronto has 144 categories. As checkboxes that
  was a screen and a half of ticks to scroll past to reach the fields below,
  with the two or three chosen ones somewhere in the middle of it.
- **The chips are the answer.** Every chosen category is on screen without
  opening anything, and its × drops it.
- **A child is shown under its parent while searching**, as
  "Neighbourhood › Yorkville". Searching prints one row out of the middle of the
  tree, and the indentation that used to say whose child it was is not on screen
  any more. With no search typed, the list is the whole tree in order and the
  indentation is back.
- **Closing the box clears the search**, so the next open is the whole list
  rather than the last search still narrowing it.
- **Nothing about the saved data changed.** The same `category_relationships`
  rows are written, and the listing window's Primary category still has to be
  one of the chosen ones.

## The cover image

Every one of the four windows uploads its picture into a square field, 92px
across, through the shared `ImageUpload` with `aspect="square"`. Events, posts
and deals were 16:9 and 240px wide until 25 Sep 2026, so the same picture was
cropped one way on a listing and another way two windows along.

The public pages are unaffected and always were: a card crops what it is given
to its own shape (3:2 on the listing, event and deal grids, 4:5 on the post
grid), so the admin field's shape decides what the cropper offers, not what a
visitor sees.

## Opening hours

A weekday is off, or has one start and one end. Nothing else.

There used to be an "Add a second time on Monday" button under each open day,
for a restaurant that serves lunch, shuts, and opens again for dinner. Tyler
removed it on 25 Sep 2026. `src/components/shared/weekday-hours-fields.tsx`
draws the days for both the listing window and the deal window, so both lost it
at once.

**A second stretch saved before then is ignored, not deleted.**
`cleanListingHours` reads a day's start and end and stops there, so a listing
that used to print "12 PM–2:30 PM, 5 PM–10 PM" now prints "12 PM–2:30 PM" and
"Open now" is worked out from that one stretch. The old value is still in the
row's JSON and nothing reads it. That matters for a handful of restaurants and
for any deal that copied its times from one.

**Nothing reads it includes the database.** The Deals page narrows itself to
"On now" in SQL while each card's words come from `dealNowText` in the browser,
and the two have to agree or the list hands back a deal the card then draws as
finished for the day. Both read a day's second stretch until 25 Sep 2026 and
both stopped on the same day. `src/server/promotions/filters.test.ts` plants a
second stretch straight into the column, past the cleaner, and holds the two
answers together.
