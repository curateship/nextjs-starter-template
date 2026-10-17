# Guides

A guide is a named list of listings the site's editor writes, in the order
they choose, with a cover and a sentence or two at the top. "Best brunch in
the west end" is a page at `/guides/best-brunch-in-the-west-end`, not a
category. It is the page people pass around.

A guide belongs to the site. A visitor's saved list belongs to that visitor,
lives in `directory_save_collections`, and is left exactly as it was.

## Writing one

- **Where:** Admin → Listings → Guides, the line after Saves in the left menu.
  The screen is a table like Listings and Posts, and a row opens the guide's
  window over it, with `?open=<id>` in the address.
- **The guide card:** title, address part, intro, status and cover. A new guide
  starts as a draft, and its address follows the title until it is typed in.
- **The Listings card:** "Add a listing" searches the site's listings by name.
  Each row has a grip to drag it into place, its number, its photo and a cross
  to take it out. The grip moves a row from the keyboard too: Space picks it
  up, the arrows move it, Space puts it down. A screen reader hears the
  listing's name and its new number.
- **Saving replaces the whole list in one transaction**, in the order shown,
  so a reload always shows exactly the order that was saved.
- **Limits:** 100 listings, a 200-letter title and a 1,000-letter intro. A
  listing can be in a guide once. A listing from another site is dropped.
- **The table's Listings column** says "8 of 9 shown" when a listing in the
  guide is not published, so the public page's count is never a surprise.

## Listings that stop being published

- **Deleted:** the listing leaves every guide. The database deletes its row.
- **Draft or closed:** the listing stays in the guide and the public page
  leaves it out. The window marks the row "Draft, so the page leaves it out" or
  "Closed, so the page leaves it out", and a line under the list counts them.
  Publishing the listing again puts it back where it was.
- **Nothing left to show:** the guide's page still opens, with its band, and
  says "There is nothing to show in this guide right now." instead of failing.

## The public pages

- **A guide's page:** the band with the trail (site → Guides → the guide), the
  title, the intro, how many places, and the cover beside the words. Under it,
  the listings in the guide's order as the cards the Directory page draws,
  with their Deal tags.
- **The Guides page at `/guides`:** every published guide, newest first, as a
  card with its cover, title, the start of its intro and how many places. Tyler
  asked for this page on 17 Oct 2026.
- **The switch:** `/guides` is a page in Settings → Pages, so it can be open to
  everyone, kept for members or switched off, like Deals and Events. A guide's
  own page follows it. While it is not open to everyone, guides are left out
  of the sitemap, the feed, site search and the share card, which are read by
  nobody signed in.
- **A draft guide is in none of them**, and its address shows the
  page-not-found page.
- **Renaming a guide** forwards its old address, the same as a listing. See
  `old-addresses.md`.

## Everywhere else

- **Sitemap:** `/guides` and each published guide.
- **Feed:** a new guide is an item in `/feed.xml`, dated by its first publish,
  with "Guide" as its category.
- **Site search:** guides are a source, found by title and intro, shown as
  "Guide".
- **Share picture:** the cover. A guide with no cover gets the drawn card
  listings use, with "Guide · 9 places" where a listing has its category, at
  `/guides/share-image/<slug>`.
- **Search-engine details:** `CollectionPage`, the way a category page is,
  with the listings as an `ItemList` in the guide's order.
- **Front page row:** the front page builder's **Latest guides** block shows
  the newest published guides as these same cards, with a "Browse guides"
  button. `home-page-rows.md` has the rules.

## Where it lives

- `drizzle/0130_cms_guides.sql`: `directory_guides` and
  `directory_guide_items`. An address is unique within its site and free on
  another.
- `src/server/directory/guides.ts`: the admin reads and saves, and every
  public read.
- `src/lib/api/directory/guides.ts`: the admin's doors.
  `src/lib/api/directory/public.ts`: the two public ones.
- `src/components/directory/guides-dashboard.tsx` and `guide-dialog.tsx`: the
  screen and the window. `src/components/directory/public/guide-grid.tsx`: the
  Guides page's cards.
- `src/routes/guides.tsx`, `guides_.$slug.tsx`,
  `guides_.share-image.$slug.ts` and `guides.page.ts`; the admin route is
  `_authenticated/admin/listing-guides.tsx`.
- `src/server/directory/guides.test.ts`: addresses, order after a reload,
  another site's listing, deleted and unpublished listings, the empty guide,
  and a draft guide in none of the places a published one is.
