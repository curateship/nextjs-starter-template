# Closed listings

A listing can be draft, published or closed. Closed is for a place that has
shut for good. Its page stays up and says "Permanently closed", and it leaves
every list on the site.

Deleting a shut bakery would break the links Google and other websites hold.
Leaving it published sends people to a locked door. Closed keeps the link
working and tells the truth. Hiding a listing is what draft is for.

## Marking a listing closed

- **Where:** Admin → Listings, open the listing, The listing card, Status →
  Closed, then Save changes.
- **Reopening:** set Status back to Published. The listing returns to every
  list at once.
- **The filter:** the status filter on Admin → Listings has Closed, and its
  count is the number of closed listings on the site.
- **The bulk Change button** only publishes and unpublishes. Closing is done
  one listing at a time, because it ends a paid spot. Publishing a closed
  listing from it reopens the listing, and unpublishing one makes it a draft,
  whose page then shows the page-not-found page.

## What happens to a featured spot

Tyler's call on 17 Oct 2026: closing a listing ends its paid featured spot,
with no refund, and the admin is told before the save.

- **The warning:** when Closed is picked on a listing holding a spot, the
  window says "Saving as closed ends its featured spot, paid until 12 Nov 2026.
  No money is refunded." The window asks the server at the moment Closed is
  picked, not when it opens, because the Listings table fetches a row's copy
  when the pointer crosses it and a spot bought after that would be missed.
- **On save:** every spot the listing holds, including one bought to start
  later, is marked revoked in the same database write as the status. Admin →
  Listings → Featured keeps the row, with the note "Ended because the listing
  was marked permanently closed. No refund."
- **Reopening does not bring the spot back.** The owner buys a new one.
- **A closed listing cannot be bought a spot**, because buying needs a
  published listing.

## The page

- **The label:** "Permanently closed", with a closed-door icon, under the name
  in the band at the top.
- **Hidden:** the opening hours card, the phone row, every directions row,
  Save, Claim this listing, Message the owner, Follow for deals, "Deals here"
  and "What's on here".
- **Kept:** the photo, rating, address, website and other links, social
  profiles, the write-up, the site's own fields, "Also nearby" and "Report a
  problem". A report is how a visitor says the place has reopened.
- **The share picture** still draws, because the page still names it.
- **Search-engine details:** schema.org has no field for "permanently closed".
  The page says `LocalBusiness` with opening hours of 00:00 to 00:00 on every
  day, which is how Google's guide writes "closed all day". The listing's own
  hours are left out. An open listing that is open all day is written 00:00 to
  23:59, so it can never be read as closed.

## Where a closed listing appears and where it does not

- **Not in:** the Directory page and its count, site search, the search box's
  suggestions, a category page and its count, front page rows, the map,
  "Also nearby" under another listing, "Recently viewed", a guide's page, a
  listing card inside a post, a visitor's saved lists, the feed, the deals
  pages, the owner's website badge and outreach emails. Each of these already asked for published listings only.
- **Still in:** the listing's own page and the sitemap. Tyler chose on 17 Oct
  2026 to keep closed pages in the sitemap, following Google's advice to let it
  find the "closed" for a while.
- **Linked from:** an event held at the place, and the listing link in an
  automation email, because the page they point to still opens.
- **Named on Admin screens:** Admin → Promotions marks a deal "Listing is
  closed", a submission matching a closed listing says "already listed and
  marked permanently closed.", the listing picker in the post, event, deal and
  guide windows marks it "Closed", and the guide window says "Closed, so the
  page leaves it out".

## Where it lives

- `src/lib/directory/listing-status.ts`: the three states and
  `LISTING_PAGE_STATUSES`, the two whose page opens.
- `drizzle/0128_cms_listing_closed.sql`: allows the new value. Every old value
  is still allowed.
- `src/server/directory/featured.ts`: `featuredSpotEndsAt` and
  `endFeaturedSpotsOfClosedListing`.
- `src/server/directory/closed-listings.test.ts`: one test per list.
