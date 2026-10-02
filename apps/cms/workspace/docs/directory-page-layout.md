# How the public directory pages are laid out

The three pages a visitor sees — the browse page, a category page and a
listing — follow the Eat Drink Toronto design. This file says what each one
draws and the rules behind the parts that are not obvious from looking.

## A listing's page

The band, then two columns above 1024px wide and one column below it. The whole
page is 1152px at its widest.

- **It opens with the same band as the directory and a category**: the trail,
  the listing's name as the page's `h1`, and the Featured badge under it. The
  name sat on the card beside the photo until 27 Sep 2026, when Tyler asked for
  every directory page to open the same way.
- **The rating is the chip over the photo**, at its top left, the same chip a
  listing card draws in the directory. A listing with no photo has nowhere to
  hang it and keeps the stars, on the card's top line beside its social links.
  Either way the rating is printed once.
- **The photo is flush with the top of the card.** The card drops its top
  padding for a photo, or a strip of card shows above it.
- **The narrow column, on the right**, holds the listing's card: photo, and
  one row per way of reaching the business — the
  address, the phone number, the website, the email, directions, "Is this your
  business?" and "Report a problem". The rows run the full width of the card so
  the whole line lights up under the pointer.
- **"Report a problem" is the last of those rows**, not a link at the foot of
  the page. Somebody who has just read the hours and knows they are wrong is
  looking at that card, and it is still the quietest line on it.
- **The wide column, on the left**, holds the photo gallery, the write-up, the
  fields this site invented, "Deals here" with up to three of the listing's
  live deals, "What's on here" with the next events held at the listing, and
  "Also nearby". `promotions.md` covers the deals box and
  `events.md` the events box. A listing with no live deal has no deals box and
  no heading.
- **A listing's card in the directory** carries a small Deal tag with the
  headline, like "20% off", while one of its deals is on. `promotions.md`
  says how it is read.
- **Business hours** is a card of its own under the narrow column.
- **On a phone the narrow column comes first.** Somebody opening a listing
  wants the photo, the name and the phone number, not the write-up. The wide
  column moves above it only once both fit side by side.
- **The narrow column sticks** while the wide one scrolls past it, on a wide
  screen only.
- **A listing with nothing in the wide column** — no write-up, no tags, no
  photos, nothing else like it — is drawn as one column rather than a card
  beside an empty half of the page.

Today's row in Business hours is pulled to the top of the week and drawn in
black; the other six stay in their usual order in grey. Which day is today
comes from the reader's clock, so the card draws the plain week on the server
and moves today up once it is in the browser. A server in one timezone must not
decide what Thursday means for a reader in another.

## The trail at the top of a page

Every public directory page but the browse page opens with the trail that says
where it sits: **Eat Drink Toronto › Directory › Chinese › Lantern House**. It
is the same trail the shell draws on its own public pages, and it is meant to
look it — grey words at the page's own size, a chevron between the steps, and
the page you are on in black. The last step is not a link back to where you
already are.

- **It sits 16px under the header**, its own gap, not the site's page spacing
  from Settings → Styling → Spacing. A site with 40px of page spacing put a
  field of empty background above three grey words and pushed the page's real
  first line twice as far down as the trail was tall. Tyler asked for this on
  27 Sep 2026.
- **It keeps at least 24px above the page's first line.** The site's Spacing
  setting is 12px by default, and 12px between the trail and the heading under
  it read as one block rather than two. A site with wider spacing than 24px
  keeps what it chose, and flat mode, which is a spacing of 0 and means no gaps
  anywhere, gets none of it.
- **The Events page is the exception**, because it draws its trail inside the
  band at the top, which cancels the page's spacing and adds its own.

## The gaps between a page's blocks

A listing's cards, its two columns and the blocks down each of them are spaced
by the site's own **Spacing** setting, the same number the grids of cards
inside them use. They were a fixed 8 or 12 pixels until 27 Sep 2026, which left
a page's own blocks closer together than the cards within them on a site that
widened its spacing.

## Directory pages always read from the left

A site's Styling settings can centre its public text, which suits a page of
marketing. Every directory page overrides it and reads from the left, because a
centred record puts a field's name over its value and a phone number over an
address. Anything that genuinely belongs in the middle — an empty list, the
pager — says so on itself and is unaffected.

That override covers the buttons and rows as well as the text, from 27 Sep 2026. It used to cover only the text, so a site set to Centre drew a hero's
heading on the left with its button, its stars and its line of proof in the
middle of the page. The frame declares its own content alignment of "left" and
every row inside reads that one.

**The header and the footer are not inside it**, so they still follow Settings
→ Public → Styling → **Content alignment**. A site set to Centre has a centred
footer above left-read pages, and the one dropdown is what changes it.

A home page row sets where it sits across the page with the shell's own
**Alignment** choice in the row window: Follow the site, Left, Centred or Right.
CMS had a "Centre this row" switch of its own until 27 Sep 2026, and a row that
was centred came across as Centred.

## Opening hours, and a day with two services

A day holds an opening time, a closing time, and optionally a **second**
stretch. The second one exists for restaurants that serve lunch, shut for the
afternoon, and open again for dinner.

- **One pair of times cannot say that.** Storing noon to ten for a place that
  is shut from 2:30 to 5 tells a visitor it is open at four o'clock, which is a
  false statement on the page rather than a rounded one. That is why the second
  stretch was added rather than taking the widest span.
- A day reads as "12 PM–2:30 PM, 5 PM–10 PM" on the page, and the "open now"
  line names whichever stretch is running, or the next one to start.
- **Open all day and night** is stored as `00:00` to `00:00`.
- Two stretches is the limit. Nothing in the old site's data had three.

## Neighbourhood labels

A site can name one parent category as the one that holds its neighbourhoods,
in Settings → Directory → Listing pages. Whichever of a listing's
categories is a child of that one is drawn as a small label on its card and on
its row under another listing.

- **Empty means no labels**, which is every site until an admin picks one.
- Only a category that has children is offered, because picking a leaf would
  label nothing.
- Deleting the chosen category empties the setting rather than leaving a
  pointer to something that is gone.
- Only one label is ever drawn. A card carrying six of a listing's categories
  tells a visitor nothing.

## The browse page

The page is a band, then one column of listings. The band holds the directory's
name and one bar carrying the search box, the town box, the "use my location"
button, the distance and the Search button. Under it is one line — how many
listings there are on the left, then a button per group of filters, then the
order — and the cards fill the whole width below it, four across on a wide
screen.

The filters ran down a 16rem column on the left of the page until 27 Sep 2026,
when Tyler asked for them to sit at the top in buttons that drop down. A column
of tick boxes was the first thing on the page and the listings had two thirds
of the width; now the results are what a visitor sees, and the tools for
narrowing them take a line.

- **The band runs the whole width of the window** and starts where the header
  ends, with a dotted pattern over it. It is drawn inside the page's 1152px
  column like everything else, so it climbs back out by centring itself on
  that column: a child wider than its column spills the same amount either
  side, and the column is centred in the window. An offset would land wrong on
  a site that centres its public text; centring lands right either way.
- **Its width is the window's, measured in the browser**, because `100vw`
  counts the scrollbar on Windows and a band that wide would add a sideways
  scroll. The server draws `100vw` and the exact number replaces it on
  arrival. On a Mac the two are the same.
- **The frame's grid column is `minmax(0, 1fr)`.** Without it the band drags
  the whole page wider than the window and every page under it shifts.
- **The lift under the header is the site's own top spacing** from Settings →
  Styling, not a number written into the band.
- **The dots are a twentieth of the text colour**, so the pattern follows a
  site into dark mode rather than being a grey nobody chose.
- **The band reads from the left**, like every other directory page, even on a
  site whose Styling settings centre its public text. It sits outside the
  page's column, so it says so itself rather than inheriting it.
- **The line under the title is the site's browse intro** from Settings →
  Directory. A site that never wrote one gets the title alone rather than a
  gap where a line should be.
- **The search bar carries a soft shadow** and sits a size above the controls
  inside it, so it reads as the thing the page is for. The controls in it are
  the app's standard 32px; the bar's own padding gives it its height.
- **The words in the band start where the page's cards start.** The band runs
  the whole width of the window, and its padding is on the band rather than on
  the column inside it, or the title would sit 16px further in than the header's
  logo and the cards below it.
- **One button per group, and one for the rating**, each opening a panel of the
  same tick boxes. A button carries how many of its boxes are on, in brackets
  after its name, and is drawn in full contrast while any of them are, so the
  row says which filters are doing something without opening any of them.
- **A panel ends with Clear and Done.** Clear empties that group alone; Done
  shuts the panel. Nothing waits to be applied — a tick changes the page and
  the address straight away, and Done is only the way out.
- **A panel's list scrolls at 288px**, with the height on the scrolling box
  rather than the frame around it. A height on the frame clips the options past
  it with no way to reach them.
- **The same buttons on a phone**, wrapped onto as many lines as they need.
  They were a Filters button opening a sheet while the filters were a column.
- **A group of filters is a parent category.** "Cuisine" and "Neighbourhood"
  are not settings anybody fills in. Any category that has children becomes a
  group and its children are the boxes, in the order an admin arranged them.
  A site whose categories are a flat list gets no groups, only the rating.
- **A child with nothing published in it is left out**, and a parent left with
  no children after that is dropped whole. A box that can only ever return an
  empty page is a dead end.
- **The count beside a box is the whole site's**, not what is left after the
  other boxes. Toronto's Etobicoke says 197 while the list above says 8,
  because the number answers "how much is there" rather than "how much is
  left", and recounting every box on every keystroke would be a query per box.
- **A group of more than eight gets a search box** that filters its own
  options, never the listings. A ticked box stays in view even when it does not
  match what is typed there, or unticking it would mean clearing the search
  first to find it again.
- **Ticking two boxes in one group means either of them. Ticking across two
  groups means both.** Italian or Portuguese, in the Annex. The address is one
  key holding a comma-separated list, `?category=italian,portuguese`, so every
  link written when only one category could be picked still means what it
  meant, and the server decides which group each slug belongs to.
- **Rating is Any, 4.0+ or 4.5+.** A listing nobody has scored is out when a
  minimum is asked for: a place with no rating is not a place rated 4 and over.
- **Clear all** sits beside the count, and only while something is on.
- **A category page opens with the same band as the browse page**, without the
  search bar: the trail, the category's name at the page's largest size, the
  line under it, and its picture beside the words where it has one. It was
  plain text on white until 27 Sep 2026, when Tyler asked for the two pages to
  open the same way. `PublicTitleBand` is the band with the search taken out,
  and any page that is a name and a line can use it.
- **A category that only groups others shows its children and nothing else.**
  "Type" holds Bar and Italian restaurant and has nothing published under it
  directly, so the page is its band and its cards: no count, no filter buttons,
  and no empty card telling a visitor to choose one of the cards in front of
  them. A parent that does hold listings of its own keeps all three. Tyler
  found this on 27 Sep 2026.
- **A category page carries the same filters, without its own group.** Every
  listing on the Italian page is already Italian, so a Cuisine box there could
  only narrow the page to itself or empty it. The Neighbourhood boxes still
  work, and the page number keeps them.
- **Every filter is in the address**, so a narrowed list can be sent to
  somebody, survives a refresh, and comes back with Back. The pager carries
  them too: page 2 of a narrowed list is still narrowed.

## The listing cards on both pages

- **A listing card is read in three parts.** Over the photo sit the category,
  in a pill on the left, and the rating, in a chip on the right. Under the
  photo come the name and two lines of the description. Below a
  dividing line come the address and the neighbourhood label. A visitor
  scanning the page learns what a place is and how good it is from the photo
  alone, without reading a word.
- **The same card is used everywhere a listing is drawn.** The browse page,
  category pages, a home page row and behind a map pin all draw it, so the four
  cannot drift apart.
- **The rating is printed once.** On a card with a photo that is the chip over
  it; the row of stars under the name was the same thing said twice and was
  taken out on 27 Sep 2026. A card with no photo has nowhere to put the chip,
  so it keeps the stars instead. Whichever is drawn is the one a screen reader
  is given.
- **A listing with no photo keeps its category** in the row of tags above the
  name.
- **Saving a listing is the bookmark at the bottom right of the photo.** It
  moved there because the rating chip owns the top right. It appears on hover
  on a desktop and is always there on a phone.
- **The photo is offered in three widths.** A phone downloads the 400-pixel
  copy rather than the full-size upload, through the same resizing route the
  media library uses.
- **A card is as tall as what is in it.** Cards in one row are not stretched to
  match the tallest of them, because that puts a band of empty white between
  the description and the dividing line. The bottoms sit where they fall.
- **The line above the address is a divider, not a shaded strip.** The shared
  card footer draws a grey band at the bottom of a dashboard card. On a listing
  card that background is cleared, so only the hairline is left.
- **The photo fades into the card at its bottom edge**, over the last 64
  pixels, so there is no hard line between the picture and the name. The fade
  is the card's own colour, so it works in dark mode too.
- **Hovering a card lifts it.** The card rises 2px and casts a wide soft
  shadow, 24px of blur at 12% black. The photo is not touched and the card's
  colour does not change. Somebody who has asked their computer for less
  movement gets the shadow without the lift. The same hover is on the category,
  deal, post and search cards, through `src/lib/layout/card-hover.ts`.
- **The shadow is a filter, not a box shadow.** `theme.css` sets the box shadow
  of every card from the Divider lines setting, and that rule beats a utility
  class, so a hover shadow written as a box shadow would never appear.
- **The two chips line up with the words under them.** Both sit 16px in from
  the card's edge, which is the card's own content padding, so the category
  pill starts where the name starts and the rating ends where the address ends.
- **The space between cards is the site's gutter** from Settings → Styling, the
  same value stacked cards use. It is not a fixed 8 or 12 pixels.
- **The browse page keeps its search box, its sort and its near-me row.** The
  old site had none of them; they are worth more than matching it exactly.
- **A category's picture sits beside its name** in the band, capped so the
  words stay the biggest thing on the page, and stacks under them on a phone. A
  category with no picture keeps the name alone.
- **Category cards run four across** above 1280px, three from 1024px and two on
  a tablet — the same grid as the listing cards under them, so a page of
  categories and a page of listings read the same.
- **Categories stay at `/directory/category/<slug>`.** The old site used
  `/categories/<slug>` and the addresses were deliberately not moved.

## "Also nearby" at the foot of a listing

A listing page ends with one row of other places, drawn as rows — photo, name,
description, stars, address, neighbourhood — rather than as cards. Somebody at
the bottom of a listing is comparing five places, and a row fits each fact on
one line. The grid of cards stays on the pages where a visitor is looking
rather than comparing.

- **The row holds four places and the pin fills it first.** Up to four
  published listings within 1 km, closest first, each printing its distance:
  "200 m away", "1.4 km away", or "Nearby" under 100 m. A kilometre is a few
  minutes' walk, which is the point. Somebody finishing dinner wants a bar they
  can walk to.
- **The listing's neighbourhood tops the row up.** Most listings have a street
  address and no map pin, and a pinned one out in the suburbs can have nothing
  within a kilometre, so the rest of the four are other places in the same
  neighbourhood. They print no distance, because there is none to measure.
- **The heading is "Also nearby" whichever half filled the row.** Tyler's call
  on 1 Oct 2026: the visitor is never shown the machinery behind it.
- **A place found both ways is printed once.** The pinned half is read first and
  the top-up leaves out everything already in it, so the row still reaches four.
- **A listing with neither a pin nor a neighbourhood gets no row at all**, and
  neither does a site that has not said which parent category holds its
  neighbourhoods. `Neighbourhood labels` above says where that setting lives.
- **The distance is measured the same way the near-me search measures it**, so
  "within 1 km" means the same here as on the browse page and the Events page.
- **The row sits inside the listing page's two-minute cache.** Publishing a
  listing clears that cache for the whole site, so a new neighbour appears on
  the next read rather than waiting out the two minutes.
- **There used to be a second row above it, "Related listings", picked by
  category.** Tyler had it removed on 1 Oct 2026. It could not help a listing
  filed under nothing, and two rows of other places under one listing was one
  too many.

## Where these settings are

Settings → Directory holds one card per public page, and everything that
changes a page is in that page's card. Every card folds away, and so does every
titled block inside one, and this browser remembers which you left shut. Tyler asked for this on 27 Sep 2026,
after the settings had grown into nine cards named after features rather than
pages.

- **Directory page** — this page: its title, its introduction, how many
  listings a page holds, the order they start in, the row of category cards at
  the top, the map, and the search by town or postcode. The map and the search
  each need their own Google key, and each section says which.
- **Listing pages** — the category that names this site's neighbourhoods, which
  is the small label on a listing's card.
- **Events and deals pages** — the site's time zone, which is what their times
  are read in and what decides when one is over.
- **Every public page** — the button that forgets this site's saved public
  pages.

Three things a page needs are not here, because they belong to the shell rather
than to this app: the site's home page, which is built in Public → Pages →
Front page out of rows this app adds kinds to (`home-page-rows.md`), who may see
a page at all, also in Public → Pages, and the site's own name, its one logo
and its share image, in Platform settings → General settings, with its colours
in Public → Styling.
