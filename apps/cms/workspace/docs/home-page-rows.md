# A site's home page rows

Each site builds its own home page out of rows, in Admin → Settings →
Directory → **Home page**. A row is a heading, an optional line under
it, and then whatever the row shows. Rows are dragged by the handle on their
left to change their order, the same as the rows of the platform's own front
page, and the new order saves itself. Clicking anywhere else on a row opens it,
and the row lights up to say so. Every block inside that window folds away, and
this browser remembers which you left shut. The first row is the top of the page and
its heading is the page's one h1.

Nothing is drawn above the rows. The page used to open with the Browse page's
title and introduction, which is why "Directory" and a line about the site sat
over every row until 27 Sep 2026. Tyler asked for them to go. Those two settings
are still what titles the browser tab and what search engines are given as the
page's description, because a page needs both and a row of cards does not
describe itself.

This is not the same thing as Settings → Public pages → Front page. That one
belongs to Custom Shell and is the deployment's own landing page, one page for
the whole platform. The rows here belong to one website. The two screens were
both called "Front page" until 26 Sep 2026, which is why this card is now called
"Website home page": the names were the only thing telling them apart.

Two kinds of row are copies of the shell's, because the same thing is wanted at
the top of a website as at the top of the landing page. A hero and a row of
plans are drawn by the shell's own components, so they look identical on both
and there is one copy of each to fix.

## The seven kinds

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
- **Hero.** A large heading, the line under it, then either a button or a box
  that takes an email address, an optional short line of proof with up to five
  stars, and an optional picture beside the words. With a picture the hero is
  two columns; without one the words run across the page. A phone stacks them
  either way, words first.
- **Plans.** The plans on sale, in the same cards the deployment's own landing
  page draws.

Events, Current deals and Latest posts are set up the same way: a category or
"every one of them", and how many, 1 to 12. A hero holds its own words and
picture. A row of plans holds nothing at all.

## A hero

The row's heading and introduction are the hero's words, so there are no second
fields for them. Everything else is optional except the button, which is all or
nothing: wording with no link, or a link with no wording, is refused out loud
rather than half-saved. An email form needs only its wording, because its
address box is the link. The address typed there travels to the register form
and lands in its email box; nothing is stored on the way.

The picture opens the media library as a window of its own, for the reason
`image-fields.md` gives. A button link is a page on this site starting with `/`,
or another site starting with `https://`. A link the checks refuse is named as the reason the save
stopped, never quietly dropped.

## A row of plans

The plans belong to the deployment, not to the site. There is one set of public
plans for the whole platform, so there is nothing to choose in the row and they
are read once however many rows of plans a page has. A plan card sends a visitor
to the register form and a signed-in member to their own billing page, which is
what the platform's own landing page does.

They are read when the page is drawn rather than with the rest of it, because
the page's shape is cached for two minutes and a price pasted a minute ago
should reach the next visitor. A deployment with nothing on sale has no plans,
so the row is dropped, and a page that was only that row falls through to the
platform's own front page. Payments being switched off counts as nothing on
sale: prices with a dead button under each one are worse than one row fewer.

## Centring a row

Every row reads from the left, like the rest of a site's public pages. **Centre
this row** in the row window puts that one row's heading, its line and its
buttons in the middle instead, so a hero can be centred above a left-read row of
listings. Tyler asked for it per row rather than per page on 27 Sep 2026.

- **The cards do not move.** A row of listings, events, deals or posts keeps its
  grid exactly where it was; only the words and the buttons above and below it
  move.
- **A hero moves as a whole**, because a hero's words stop at 768px rather than
  filling the page.
- **It is not the site's Content alignment setting.** That one, in Settings →
  Public → Styling, still decides the header and the footer. A site's pages
  themselves always read from the left, whatever it says.

## Rules that hold for every row

- **A row with nothing in it is dropped**, never drawn as a heading over an
  empty space. A hero is its own content and can never be empty. A home page whose rows all come back empty is not drawn at all,
  and the shell's own front page is shown instead. That fall-through is only
  ever for a site. The deployment's own address is a different question, and
  `the-root-address.md` answers it.
- **A row follows the page it leads to.** A row of events is left off for a
  visitor who may not see the Events page, and the same goes for deals and
  posts. Every card on those rows leads to that page, so a row that survived
  would be a set of closed doors.
- **There is no limit on how many rows.** A home page held six until 27 Sep
  2026, when Tyler took the cap off: drawing a row costs nothing, and what the
  number was really guarding is how many records the first visit reads. The
  per-row count of 1 to 12 still holds that down, and the page is then
  remembered for two minutes. A rearrange still sends at most 500 ids in one
  request, which is a bound on the request rather than on the page.
- **The page's shape is cached for two minutes**, and saving a listing, an
  event, a deal or a post clears it. Events, deals and posts are read after
  that cache, so what is on and what has just been published are never stale.
- **There is no sample data.** A site with nothing to show has no rows, not a
  row of examples.

## Where the code is

`src/lib/directory/front-page.ts` decides what a row may be, and the admin
form, the endpoint and the server all read it, so the three cannot disagree. A
hero's fields are cleaned and checked there too, by the shell's own hero
normalizers, so a site's hero refuses exactly what the platform's hero refuses.
The plans are read in `src/app/options.ts`, the only place that knows the page
is about to be drawn.
`src/server/directory/front-page.ts` reads the page's shape and fills the
events, deals and posts afterwards. `src/app/directory-front-page.tsx` draws
it. `src/components/marketing/front-page-content-blocks.tsx` and
`src/components/shared/pricing-table.tsx` are the shell's, imported rather than
copied. The rows live in `directory_front_page_sections`, whose `kind` column
has a check constraint that a migration widens each time a kind is added, and
whose seven `hero_*` columns hold a hero. Every other kind of row leaves them
empty.
