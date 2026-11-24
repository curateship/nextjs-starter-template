# Where my listing ranks

My listings tells an owner where their listing stands in its category, on
the line above the Feature button (Tyler's pick, 24 Nov 2026: "Where my
listing ranks"): "2nd most viewed in Soup over the last 30 days."

## The rule

- **Its primary category**, the one marked Primary in the listing's
  categories, or the first one in the site's own order when none is marked.
  It is the same pick a listing card makes for its category line.
- **Views over the last 30 days**, from the same daily figures Admin →
  Listings' Views column reads. An admin's own visits are never counted.
- **Only published listings**, on both sides. A draft has no page to count.
- **Only the top ten say anything.** A listing ranked 11th or lower, one
  nobody viewed in those 30 days, and one in a category of fewer than three
  published listings show no line. "1st of 2" tells an owner nothing.
- **Equal views share a place.** Two listings can both be 2nd, and the next
  one is then 4th.
- **Beside the Feature button**, inside its block, because the point of
  knowing the rank is the top spot the button sells.

## What was left out

- **The monthly views email** was meant to carry the same sentence as an
  email word. That email (directory task 28) is not in this code, and adding
  a word to the automation's Send email step means changing the shell's send
  step from inside Directory, which the rules forbid. Tyler's call,
  24 Nov 2026: "My listings only". The word waits for a shell task.

## Where it is in the code

- `src/lib/directory/listing-rank.ts`: the numbers, "1st", "2nd", "3rd",
  and the sentence.
- `listingCategoryRank` in `src/server/directory/views.ts`: the count.
- `listingsOwnedBy` in `src/server/directory/claims.ts`: each owned
  listing's rank, read with the page.
- `FeaturedPurchase`'s `note` in `src/components/directory/my-listings.tsx`:
  the line.

## Checking it

Open `http://localhost:3015/my-listings` signed in as the local admin, who
owns 43 Down. With the sample views seeded on 24 Nov 2026, it reads "2nd
most viewed in Soup over the last 30 days." above Feature this listing.
