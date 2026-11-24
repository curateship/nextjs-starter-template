# Duplicate listings

The Duplicates row of the Listings dashboard lists pairs of listings that look
like the same place, and merges one into the other (Tyler's pick, 24 Nov 2026:
"Merge duplicate listings"). It sits among the queues in the Dashboards
block, after Reports, and its pill counts the pairs.

## Which listings pair up

Tyler's rule, 24 Nov 2026: "Same address + close name".

- **A close name is always needed.** It is the test the "already listed"
  warning on a submission uses (`submission-duplicate-warning.md`): the same
  name once "The", "&" and punctuation are set aside, or one name of eight
  letters or more inside the other.
- **Then the same street address**, the part before the first comma, with
  case and punctuation set aside. "575 College St, Toronto" and "575 college
  st." are one address.
- **A listing with no address** pairs on a close name plus the same phone
  number or website, since nothing else tells the two apart.
- **Every status counts.** A draft somebody started is the same place as the
  published one.
- **Why not the submission's rule.** That rule warns when any one of name,
  phone or website matches, which suits one newcomer. Run across every
  listing, it paired about 470 of Eat Drink Toronto's 3,333: chains at
  different addresses (Burrito Boyz in five places) and food-hall counters
  sharing one phone. The address rule finds the real ones.
- **Speed.** The query joins listings at one address first, then compares
  names. That took 25ms on 3,333 listings, where comparing every name with
  every other took 2.7 seconds. The pill is worked out on every change, so
  the slow way would hold up the whole dashboard.

## The row

- **Each row** names both listings, says what matched ("Same street address,
  and a very close name."), and shows the address once the panel is wide
  enough.
- **Search** finds either name.
- **No Mass select.** A merge needs somebody to pick which listing stays, one
  pair at a time.
- **The right-click menu** has Not a duplicate.

## The right panel

- **The two listings side by side**, the older one first, each in its own
  card: status, address, phone, website, owner, saves, events, deals and the
  day it was added. That is what helps pick the one to keep.
- **Keep this one** on a card asks first, because a merge cannot be undone.
  The question says what goes, what moves and where the old address leads.
  Keeping a draft over a published listing adds that the place has no public
  page until the draft is published.
- **Not a duplicate** in the footer and in the ⋮ hides the pair for good.
  Saying it twice is the same answer.
- **The ⋮** also opens either listing on the Listings row.

## What a merge does

One database transaction, so a failure halfway changes nothing.

- **The kept listing keeps its own fields**: name, address part, photo,
  hours, write-up, links and categories. Nothing is copied across from the
  other one.
- **Everything that pointed at the other one moves to it**: saves, follows,
  events held there, event suggestions, deals and deal requests, guide
  entries, reports, owner messages, owner change requests, claim invitations
  sent, and the submission it came from.
- **Held once.** A saved list holding both, a person following both, a guide
  listing both and an invitation sent to one address about both keep a single
  copy, on the kept listing.
- **Listing cards in posts** hold the listing's id and nothing else, so the
  merge swaps the id in each post's own text. The card then shows the kept
  listing.
- **The owner:**
  - Only the merged listing has an owner: the claim moves to the kept one.
  - Both have the same owner: the kept listing's claim stays, and the other
    claim's featured spots and change requests move onto it before that claim
    goes. Nothing the owner paid for disappears with it.
  - Two different owners: the merge refuses with "Both listings have an
    owner, and they are different people. Turn one of the two claims down
    first, then merge."
- **Both listings holding a running featured spot:** the listing whose spot
  ends later keeps its spots, and the other listing's end with no refund,
  revoked on the Placements row with the note "Ended because its listing was
  merged into …, which already had a longer spot. No refund." It is the rule
  closing a listing uses (Tyler, 17 Oct 2026, `closed-listings.md`), and the
  task that planned this asked Tyler to say if that reads wrong. A listing's
  own spots are never weighed against each other, so one bought to start
  after another stays.
- **A payment in progress refuses.** While somebody is in Stripe's checkout
  for either listing, the merge says to wait until the payment is done.
- **The old address forwards** to the kept listing, and so does every older
  address that led to the merged one, one hop, as a rename does
  (`old-addresses.md`). A kept listing that is a draft has no public page, so
  the forward lands on the page-not-found page until it is published.
- **Views.** Past views stay counted under the merged listing's old address,
  the way a rename's do, so the kept listing's Views do not take them over.
- **Only this site.** Both ids must be listings of the admin's own site. An id
  from another site is "deleted already", never merged.

## Where it is in the code

- `src/lib/directory/listing-duplicates.ts`: the rule, the words for what
  matched, and the merge's refusals.
- `src/server/directory/duplicates.ts`: the query, the page of pairs, Not a
  duplicate and the merge.
- `src/lib/api/directory/duplicates.ts`: the three admin-only doors.
- `src/components/directory/listings-dashboard/sections/duplicates-section.tsx`:
  the row and the right panel.
- `drizzle/0163_cms_listing_not_duplicates.sql`: the pairs marked Not a
  duplicate. It is owed on live until the next deploy runs it.

## Checking it

1. Open `http://localhost:3015/admin/listings?section=duplicates`. Ramen
   Isshin @ Assembly Chef's Hall and CHEFS HALL show as one pair, both at
   111 Richmond St W.
2. Press Keep this one on either card and read the question. Cancel leaves
   both.
3. Not a duplicate takes the pair out of the list and the pill.
