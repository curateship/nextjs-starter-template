# Listing view counts

## Completed behavior

- Admin → Listings shows each listing's views for all time, 7 days, 30 days,
  or the latest year.
- The Views column sorts the complete filtered result on the server before it
  is split into pages.
- Counts use each listing's current `/directory/<slug>` address and the site's
  existing traffic facts. Views from before a rename stay with the old address.
- Counts and listing rows stay within the currently selected site.
- This feature intentionally has no ranking card, charts, daily breakdown, or
  visitor identities. The Traffic screen remains the home for broader analysis.

## Test road map

1. Visit one public listing on Alpha several times, then open Admin → Listings.
2. Confirm its 30-day count rises and an unvisited listing shows 0.
3. Pick All, 7 days, 30 days, and Year. The column label and numbers should
   follow the selected range.
4. Click the Views heading. The address should include `sort=views`, and the
   complete result should order by count.
5. Compare the listing count with Traffic's total for that path and range.
6. Switch to Beta. A listing with the same address should show Beta's count,
   not Alpha's.
7. Repeat at a narrow browser width and check the console. Nothing should clip,
   overflow the page, or report an error.
