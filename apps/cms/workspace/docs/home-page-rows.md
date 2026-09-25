# A site's home page rows

Each site builds its own home page out of rows, in Admin → Settings →
Directory → Front page. A row is a heading, an optional line under it, and then
whatever the row shows. The page takes its own title and introduction from the
Browse page's.

This is not the same thing as Settings → Public pages → Front page. That one
belongs to Custom Shell, is the same for every site, and holds rows of plain
text, plans, testimonials, questions, logos and screenshots. The rows here
belong to one site and show that site's own records.

## The five kinds

- **Listings.** Cards for individual listings, narrowed to a category, ordered
  newest, featured only, top rated or A to Z, and drawn as a grid, one under
  the other, or as a map with pins.
- **Category cards.** A card per category with its photo and how many listings
  sit under it.
- **Upcoming events.** The soonest events that are not over yet, as event
  cards, with a "See all events" button.
- **Current deals.** The newest deals that are not over yet, with their
  headlines.
- **Latest posts.** The newest published posts, as post cards, with a "See all
  posts" button.

Every kind except Listings and Category cards is set up the same way: a
category or "every one of them", and how many, 1 to 12.

## Rules that hold for every row

- **A row with nothing in it is dropped**, never drawn as a heading over an
  empty space. A home page whose rows all come back empty is not drawn at all,
  and the shell's own front page is shown instead. That fall-through is only
  ever for a site. The deployment's own address is a different question, and
  `the-root-address.md` answers it.
- **A row follows the page it leads to.** A row of events is left off for a
  visitor who may not see the Events page, and the same goes for deals and
  posts. Every card on those rows leads to that page, so a row that survived
  would be a set of closed doors.
- **Six rows at most.** Six rows of twelve is 72 records, which is a home page.
  Seven is somebody discovering by accident that a front page can fetch four
  hundred records.
- **The page's shape is cached for two minutes**, and saving a listing, an
  event, a deal or a post clears it. Events, deals and posts are read after
  that cache, so what is on and what has just been published are never stale.
- **There is no sample data.** A site with nothing to show has no rows, not a
  row of examples.

## Where the code is

`src/lib/directory/front-page.ts` decides what a row may be, and the admin
form, the endpoint and the server all read it, so the three cannot disagree.
`src/server/directory/front-page.ts` reads the page's shape and fills the
events, deals and posts afterwards. `src/app/directory-front-page.tsx` draws
it. The rows live in `directory_front_page_sections`, whose `kind` column has a
check constraint that a migration widens each time a kind is added.
