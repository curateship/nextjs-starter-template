# A site's home page rows

A site's home page is built in **Settings → Public pages → Front page**, the
shell's own builder, and it belongs to the site you are in. It was a second
builder of CMS's own, in Settings → Directory, until 27 Sep 2026; Tyler asked
why there were two places to build a page when the menu and the footer are built
in one place per site, and there was no good reason. There is one now.

The shell owns the row: its heading, the line under it, how wide it sits, where
it sits across the page, whether it is hidden, and which screens it draws on.
This app adds five kinds of row to that builder, and this file is about those
five. The shell's own kinds — plain text, a hero, the plans on sale,
testimonials, an FAQ, a logo strip and screenshots — are the same on every app
built from the shell and are documented once in the repo's `docs/shell/`.

## The five kinds this app adds

- **Listings.** Cards for individual listings, narrowed to a category, ordered
  newest, featured only, top rated or A to Z, and drawn as a grid, one under
  the other, or as a map with pins.
- **Category cards.** A card per category with its photo and how many listings
  sit under it.
- **Upcoming events.** The soonest events that are not over yet, as event
  cards.
- **Current deals.** The newest deals that are not over yet, with their
  headlines.
- **Latest posts.** The newest published posts, as post cards.

Upcoming events, Current deals and Latest posts are set up the same way: a
category or "every one of them", and how many, 1 to 12. Listings adds an order
and an arrangement; Category cards picks its categories instead of filtering by
one.

## The button beside the heading

Every one of these rows shows a handful of a longer list, so each carries the
way to all of it: **Browse directory**, **Browse events**, **Browse deals** and
**Browse posts**. The shell draws it as the page's main button at the end of the
row's heading line, and it carries the row's own filter — a row narrowed to
Cafés opens the browse page on Cafés. Category cards have none: every card on
that row is already a way in.

## Rules that hold for every one of them

- **A row with nothing in it is dropped**, never drawn as a heading over an
  empty space. The app answers "nothing" and the shell leaves the row off.
- **A row follows the page it leads to.** A row of events is left off for a
  visitor who may not see the Events page, and the same goes for deals and
  posts. Every card on those rows leads to that page, so a row that survived
  would be a set of closed doors.
- **A map row needs a map key.** Without one it draws as a grid of the same
  listings, and the key is read when the page is drawn rather than stored with
  the row.
- **Each row is read on its own and remembered for two minutes.** Saving a
  listing, an event, a deal or a post clears that memory, so a record published
  a minute ago is on the page.
- **There is no limit on how many rows**, and no sample data: a site with
  nothing to show has no rows, not a row of examples.
- **A site with no rows draws its header and its footer with nothing between
  them.** It does not fall through to the deployment's own front page any more.

## Where the code is

`src/lib/directory/front-page-kinds.ts` decides what one of these rows may
hold, and the editor panel, the public component and the server's reader all
clean what they are given through it. `src/app/options.ts` registers the five
kinds with the shell and `src/app/server-options.ts` registers what fills them.
The panels are `src/components/directory/front-page-row-panels.tsx`, the public
side is `src/components/directory/public/front-page-row-content.tsx`, and the
reads are `src/server/directory/front-page-row-readers.ts`.

The rows themselves live in the site's own settings, with its menu and its
footer, so there is no table and no migration when a kind gains a field. The
old builder's table, `directory_front_page_sections`, was dropped by
`drizzle/0108_cms_drop_directory_front_page_sections.sql` after
`scripts/move-home-page-rows.mjs` moved every row onto its site's front page.
