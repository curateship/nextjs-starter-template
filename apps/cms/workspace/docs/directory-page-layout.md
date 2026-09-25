# How the public directory pages are laid out

The three pages a visitor sees — the browse page, a category page and a
listing — follow the Eat Drink Toronto design. This file says what each one
draws and the rules behind the parts that are not obvious from looking.

## A listing's page

Two columns above 1024px wide, one column below it. The whole page is 1152px
at its widest.

- **The narrow column, on the right**, holds the listing's card: photo, the
  page's `h1`, the stars, and one row per way of reaching the business — the
  address, the phone number, the website, the email, directions, "Is this your
  business?" and "Report a problem". The rows run the full width of the card so
  the whole line lights up under the pointer.
- **"Report a problem" is the last of those rows**, not a link at the foot of
  the page. Somebody who has just read the hours and knows they are wrong is
  looking at that card, and it is still the quietest line on it.
- **The wide column, on the left**, holds the photo gallery, the write-up, the
  fields this site invented, "Deals here" with up to three of the listing's
  live deals, "What's on here" with the next events held at the listing, and
  the other places nearby. `promotions.md` covers the deals box and
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

## Directory pages always read from the left

A site's Styling settings can centre its public text, which suits a page of
marketing. Every directory page overrides it and reads from the left, because a
centred record puts a field's name over its value and a phone number over an
address. Anything that genuinely belongs in the middle — an empty list, the
pager — says so on itself and is unaffected.

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
in Settings → Directory → Neighbourhood labels. Whichever of a listing's
categories is a child of that one is drawn as a small label on its card and on
its row under another listing.

- **Empty means no labels**, which is every site until an admin picks one.
- Only a category that has children is offered, because picking a leaf would
  label nothing.
- Deleting the chosen category empties the setting rather than leaving a
  pointer to something that is gone.
- Only one label is ever drawn. A card carrying six of a listing's categories
  tells a visitor nothing.

## The browse page and the category pages

- **A listing card is read in three parts.** Over the photo sit the category,
  in a pill on the left, and the rating, in a chip on the right. Under the
  photo come the name, the stars and two lines of the description. Below a
  dividing line come the address and the neighbourhood label. A visitor
  scanning the page learns what a place is and how good it is from the photo
  alone, without reading a word.
- **The same card is used everywhere a listing is drawn.** The browse page,
  category pages, a home page row and behind a map pin all draw it, so the four
  cannot drift apart.
- **A listing with no photo keeps its category** in the row of tags above the
  name, and shows no rating chip. The stars under the name are the rating in
  that case, and they are the rating everywhere: the chip over the photo is
  decoration and a screen reader is never told it twice.
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
- **A category's picture sits beside its name**, at 40% of the width, and
  stacks above it on a phone. A category with no picture keeps a plain
  heading.
- **Categories stay at `/directory/category/<slug>`.** The old site used
  `/categories/<slug>` and the addresses were deliberately not moved.

## Other places nearby

Under a listing, the other places sharing one of its categories are drawn as
rows — photo, name, description, stars, address, neighbourhood — rather than as
cards. Somebody at the bottom of a listing is comparing five places, and a row
fits each fact on one line. The grid of cards stays on the pages where a
visitor is looking rather than comparing.
