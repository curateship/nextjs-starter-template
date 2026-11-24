# Needs work

The Needs work row of the Listings dashboard lists the published listings
that are missing something a visitor looks for (Tyler's pick, 24 Nov 2026:
"Needs work list"). It sits after Duplicates in the Dashboards block, and its
pill counts the listings.

## What counts as missing

- **No photo:** no featured photo.
- **No opening hours:** no day with both an opening and a closing time.
- **No write-up:** the long text on the listing's page has no words in it. An
  empty paragraph is still no write-up.
- **No category:** filed under no category.

Only published listings are in it. A draft is still being written, and a
closed listing has no page to improve.

## The row

- **Each row** has the listing's photo, its name, its address part and a chip
  per gap: "No photo", "No opening hours", "No write-up", "No category".
- **A to Z** by name, 25 to a page.
- **Search** finds a name. **Filter → Missing** narrows the row to one gap,
  and it is remembered with the row's other filters.
- **No Mass select.** Nobody fills these in bulk, so there is nothing to tick
  rows for.
- **The right-click menu** opens the listing on the Listings row.
- **The right panel is the listing itself**, the same record the Listings row
  opens, so a gap is filled where it is seen. The record saves itself. Once
  the listing misses nothing it leaves the list and the pill drops by one,
  and it stays open on the right until another row is picked.

## What owners see

Tyler's rule, 24 Nov 2026: "Only gaps they can fix".

- **An owner's change form on My listings has a Photo box** and no hours,
  write-up or categories. So an owner sees only the missing photo: "Your
  listing has no photo yet. Add one here, then send the change for
  approval.", straight above the Photo box.
- **The other three gaps are the site's team's** to fill from this row.

## Where it is in the code

- `src/lib/directory/needs-work.ts`: the four gaps, their words, and
  `hasNoPhoto` for My listings.
- `src/server/directory/needs-work.ts`: the query and the pill's count.
- `src/components/directory/listings-dashboard/sections/needs-work-section.tsx`:
  the row.

## Checking it

1. Open `http://localhost:3015/admin/listings?section=needsWork`. 87 of Eat
   Drink Toronto's local listings are in it, nearly all for opening hours.
2. Filter → Missing → A photo leaves Eataly Ristorante alone.
3. Open a listing, add its opening hours in the ⋮'s Hours tab, and wait for
   Saved. The row leaves the list.
