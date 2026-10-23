# A featured spot in one category

A featured plan can sell the top of one category page instead of the top of the
whole directory. A bakery that cannot justify the site-wide price pays a
smaller amount to sit first on the Bakeries page for a month, and sorts
normally everywhere else.

`directory-saves-featured-outreach.md` covers everything the featured plans
already did. This file covers only what a category adds.

## What an admin sets

The featured plans live under Admin → Listings → Featured, not at the top of
the menu. The plan window there has two fields for this.

- **Puts the listing at the top of.** The whole directory, or one category.
  Blank is the whole directory, which is what every plan sold before, so a
  saved plan keeps working untouched.
- **Spots.** How many listings can hold a paid spot on that category's page at
  once. It only appears once a category is picked. Between 1 and 100.

The plans table says which it is. A whole-directory plan reads "Listings", an
event plan reads "Events", and a category plan reads the category's name with
"3 spots" under it.

A plan sells either the whole directory or one category, never both. An event
plan can never name a category, because an event's spot is the top of the
Events page and that page has no categories.

## What the owner sees

The Feature button on My listings shows a category plan only when their listing
is actually in that category. A Bakeries plan is not on a restaurant's list at
all, and asking for it directly is refused with "This listing is not in
Bakeries, so it cannot buy the top of that page."

Each plan's line reads "30 days · Bakeries · 2 spots left". A whole-directory
plan has no category and no count, so its line is just "30 days".

**Sold out stays on screen, greyed, reading "Sold out in Bakeries".** Tyler's
call on 2 Oct 2026. Hiding it would leave an owner who was told about the plan
with no idea where it went, and the greyed row tells them the spot exists and
is worth coming back for. The reason is also a tooltip on the row, which is how
a keyboard reaches it.

A listing still holds one paid spot at a time. A bakery with a Bakeries spot
running cannot also buy a site-wide one until the first ends, which is the same
rule as before this change. So a listing can never be featured site-wide and in
a category at once, and there is no second badge to suppress.

## Which page a spot counts on

- **A whole-directory spot counts on every page**, exactly as it always has.
- **A category spot counts on its own category page only.** It leads that page
  and wears the Featured badge there. On the browse page, on a listing's own
  page, in the "Also nearby" row and on every other category page it is not in
  the sort at all and carries no badge.

The badge and the order are read from the same rule on purpose. A badge on a
page where the listing sorts like everything else would be claiming something
that is not true.

Expiry needs no cleanup job. The spot is checked against the clock every time a
page is drawn, so a category spot that ends drops back into ordinary order on
the next read.

## How the limit holds when two people race

The last spot on a page is the one place two buyers can collide, so the count
and the write happen under a lock.

- **The lock is on the category row, not the plan.** Two plans can name the
  same category and both sell the same page, so locking the plan would let a
  Bakeries plan and a Bakeries Plus plan each hand out the last spot. Nothing
  in a purchase writes to the category row, so waiting on it costs nothing
  except when two people really are racing.
- **An unfinished checkout holds a spot for 24 hours.** Somebody sitting on
  Stripe's payment page has not paid yet, and letting the next buyer through
  would oversell the page. A Stripe Checkout session expires 24 hours after it
  is made, so after that the reservation can never become a payment and stops
  counting.
- The refusal an owner reads is "Every featured spot on Bakeries is taken. Try
  again once one ends."

There is one narrow way a category can end up one over its limit: a buyer who
opened a checkout, waited almost the full 24 hours, and then paid in the
minutes after their reservation stopped counting. A refusal at that point would
mean taking the money and giving nothing, so the payment wins and the page
shows one extra until that spot ends.

## What happens when a category is deleted

Nothing breaks and nothing is blocked. The plan keeps the id of the category
that has gone, the admin's table says "Category deleted" in place of the name,
and nobody can buy that plan any more. Paid spots already sold keep their
record of what was bought; they simply match no page.

There is deliberately no foreign key on any of the three `category_id` columns.
A cascade would try to delete a plan that a paid placement still points at, and
the placement's own rule would then refuse the whole category delete with a raw
database error. Setting the column to null is worse: a Bakeries plan would
silently become a whole-directory plan at the bakery price.

## Where it lives

- `drizzle/0111_cms_featured_category.sql` — `category_id` and `category_spots`
  on the plans, `category_id` on the checkouts and the placements.
- `src/server/directory/featured.ts` — the plan's category, the spot count,
  the lock, and which spots a page counts.
- `src/server/directory/public.ts` — the ordering and the badge on a category
  page.
- `src/components/directory/featured-dashboard.tsx` — the admin's plan window.
- `src/components/directory/featured-plans-popover.tsx` — the owner's list of
  plans.

## How to check it

1. Admin → Listings → Featured → New plan. Pick a category under "Puts the
   listing at the top of". The Spots field should appear, starting at 3.
   Create the plan and check the table row reads the category name with
   "3 spots" under it.
2. Edit the plan and switch it back to the whole directory. The Spots field
   should disappear, and the row should read "Listings".
3. Sign in as an owner whose listing is in that category and open Feature this
   listing. The plan should be there, reading "30 days · Bakeries · 3 spots
   left".
4. Open the same window for a listing that is not in the category. The plan
   should not be on the list at all.
5. Set the plan's Spots to 1 and have one listing buy it. The next owner's row
   should read "Sold out in Bakeries", greyed, with the reason as a tooltip.
6. Open that category's public page. The listing that bought the spot is first
   with the Featured badge. Open the browse page and another category page: it
   should sit in its ordinary place with no badge.
7. Move the placement's end date into the past and reload. It should drop back
   into ordinary order on its own.
8. Repeat steps 1 and 3 at 390px. Nothing should be clipped and the console
   should be clean.
