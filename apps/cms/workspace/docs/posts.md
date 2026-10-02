# Posts

Each site has a Posts page. An admin writes dated posts in Admin → Posts, and
visitors read them at `/posts`, with each post at `/posts/<address>`.

## Rules Tyler set

- **Posts can show listing cards inside the body.**
- **Posts share the directory's categories.** They are filed through the same
  `category_relationships` table as listings, with the content type
  `post`.
- **Posts get their own table.** The shell's written pages are not widened:
  a written page is only a title, an address and a body, and stays that way.
- **CMS has its own writing box for posts.** Chosen on 17 Sep 2026 over a
  stack of separate text boxes and over changing Custom Shell first. The
  shell's editor only allows its own fixed list of blocks, and an app never
  edits a shell file.
- **No comments, no author pages, no scheduled publishing** in this version.

## What a post is

- **The table:** `posts`, from `drizzle/0080_cms_posts.sql`. A post
  has a title, an address, a cover image, a summary, a body and a status.
- **The address:** unique on its own site. Two sites can each have a
  `best-bakeries`. A title typed on a new post writes the address until the
  address is typed in directly, and a clash is numbered, like
  `best-bakeries-2`.
- **Draft or published:** a new post is a draft. A draft is never readable by
  a visitor, by its address or anywhere else.
- **The published date:** set the first time a post is published and kept
  after that. Taking a post down and putting it back does not move it to the
  top of the Posts page.
- **Deleting a site** deletes its posts. Deleting a post removes its category
  tags too. The listings and categories it pointed at stay.
  Deleting a category removes it from its posts, and the warning before the
  delete counts those posts separately from the listings.

## Writing a post

- **Where:** Admin → Posts, at `/admin/posts`. The sidebar link is not added
  automatically. Add it in Settings the same way the Listings link was added.
- **The list:** search by title or address, filter by status, sort by title,
  status, published date or last change. Drafts have no published date, so
  they sort last in both directions.
- **The window:** title, address, summary, status, cover image, categories and
  the body.
- **Formatting:** select words and the floating bar offers bold, italic,
  headings 2 to 4, lists, quote and link. This bar is a copy of the shell's,
  in `src/components/posts/post-editor.tsx`, so a later change to the shell's
  bar does not reach posts on its own.
- **Listing cards:** the "Listing card" button above the text searches this
  site's listings and places the card where the cursor is. The cursor then
  moves to the line after the card, so writing carries on below it. It sits above the
  text rather than in the floating bar, because the floating bar only appears
  over selected text.

## Listing cards

- **What is stored:** only the listing's id. The name, photo and rating are
  read from the listing each time the page is drawn, so a renamed listing
  shows its new name.
- **When a card is skipped:** a listing that is a draft, deleted, or on
  another site draws nothing, and the rest of the post is unchanged. The
  editor says so on the card: "a draft, so the post skips it", or "It was
  deleted".
- **While the directory page is switched off**, posts show no cards, because
  each card links to a listing page that would not open.
- **Limits:** 50 cards per post. A card sits between paragraphs, never inside
  a list or a quote.
- **The rules for the body** live in `src/lib/posts/post-body.ts`. It hands
  every block that is not a card to the shell's written-page cleaner, so a
  post can hold nothing a written page cannot, plus cards.

## Reading a post

The page copies the old Directory app's post page: the words on the left with
nothing drawn around them, and a contents list in a card on the right.

- **The post is not in a card.** The cover image, the title, the date and
  category line, the summary and the body sit straight on the page, so the
  words are the only thing on the left. The title is larger here than anywhere
  else on the site, 30px on a phone and 36px on a wide screen.
- **The cover image can be turned off.** Settings → Directory → Post pages has
  one switch, "Show the cover image at the top of a post". It is on for every
  site, because that is what post pages did before the switch existed. Off, the
  page starts with the title.
- **Turning it off takes the picture off this page only.** The post keeps its
  cover image: the cards on the Posts page, a category page and a home page row
  all still draw it, and so does the picture a post shows when it is shared or
  posted on Facebook. The switch is about one page, not about the photo.
- **The contents list is a card on the right**, headed "On this page", one line
  per heading. It is the narrow column of the same two-column split a listing's
  page uses, so the two pages line up.
- **It sticks** while the post scrolls past it, and stops below the header on a
  site whose header stays on screen. The list itself scrolls when a post has
  more headings than fit the window.
- **The line being read is marked** with a bar down its left and darker words.
  It is the last heading the reader has scrolled past, and at the bottom of the
  page it is the last heading, so a short closing section is never skipped.
- **Only the top heading level is listed.** A post's writing bar offers
  headings 2 to 4; 2 is the one the list holds, because a list that holds all
  three is an outline and not a way to jump.
- **A post with no headings has no contents list**, and the words fill the
  width of the page.
- **On a phone the contents list sits above the post**, where the old Directory
  app put it. There is no second column on a phone to put it in.

### The anchors

- **Each heading's address is made from its own words**, so `/posts/best-cafes`
  becomes `#where-to-start`. A link a reader copied still lands on the same
  heading after a paragraph is added above it.
- **The same heading twice is numbered**: the second "Worth the line" is
  `#worth-the-line-2`.
- **A heading with no words is left out**, because there is nothing to show in
  the list or to land on.
- **The rules live in `src/lib/posts/post-headings.ts`**, and both the contents
  list and the body read them, so a link always has something to land on.

## Where posts appear

A published post appears in all of these and a draft in none of them.

- **`/posts`:** newest first, 12 per page.
- **`/posts/<address>`:** the cover image, title, date, category links, summary
  and body, with a contents list beside them. Its tab title, description, share
  image and search-engine block (`BlogPosting`) come from the post. "Reading a
  post" below describes the page.
- **Category pages:** the 6 newest posts filed under a category show below its
  listings, under "Posts about <category>". A category's listing count does not
  change, because every listing count reads only listing rows.
- **The feed** at `/feed.xml`: the newest 20 listings, posts and events
  together, newest first. It is called "New listings, posts and events".
- **The sitemap:** `/posts` and every published post, in the flat file
  alongside the category pages.
- **Whole-site search:** matches the title, summary and body words, labelled
  "Post".
- **A home page row:** "Latest posts" in Settings → Public pages → Front page, beside Listings, Category cards, Upcoming events and Current deals. It
  takes a heading, an introduction, a category or "Every post", and how many,
  1 to 12. The newest come first, and the row carries a "See all posts" button.
  It is left off the page while there are no posts, and while this visitor may
  not see the Posts page, because every card on it leads there.

## The post card

The same card draws on the Posts page, under a category and in a home page row.

- **The photo fills the card** and the title sits in white over the bottom of
  it, with the site's name on the left and the published date on the right
  below it. The category is a pill at the top left and the read time a chip
  at the top right. A shade rises from the bottom of the picture, because a
  pale photo would otherwise swallow the white words.
- **The whole card opens the post**, not only the title. The card is one link
  wrapped around the photo, the chips and the words, so a click anywhere on the
  picture goes to the post and the keyboard reaches it in one tab stop.
- **There is no line above the name and the date on a photo card.** Every line
  on the site follows Settings → Styling → Divider lines, and that setting is a
  faint tint meant for a flat page background. On a photograph, under white
  text, it cannot be seen at all, so the line is gone and the space does the
  separating. Tyler's call on 1 Oct 2026, after seeing it drawn both ways.
- **The site's name is where a byline would be.** Posts have no author, and
  Tyler chose the site's name over leaving the line empty on 25 Sep 2026.
- **A post with no photo** keeps both chips above the title, then its summary,
  then the same name and date under a hairline. That line is drawn on the card
  itself rather than on a picture, so it follows Divider lines and is visible.
  Nothing is lost, it is just not drawn on a photograph.
- **The photo is offered in three widths**, so a phone downloads the 400-pixel
  copy rather than the full-size upload.

## How long a post takes to read

- **"4 min read" is the body's words at 200 a minute**, rounded to the nearest
  minute and never below one, because "0 min read" says nothing and a post with
  three words still has to be opened. Listing cards inside a post are not
  counted.
- **It is worked out when the post is saved** and kept in `read_minutes` on
  `posts`, so drawing a page of cards never fetches twelve article bodies to
  print twelve small numbers. The rule is in `src/lib/posts/read-time.ts`.
- **Posts written before 25 Sep 2026 all say "1 min read"** until they are next
  saved. The column started at 1 for every existing post rather than counting
  words in SQL, which would not have agreed with the helper that counts them
  everywhere else. Opening a post and saving it fixes its figure.

## The Posts page's on/off switch

`/posts` is a page on the Pages screen, so it can be switched off or kept for
members like any other page.

- **Switched off:** `/posts` and every post page are not found.
- **Members only:** a signed-out visitor is sent to sign in.
- **Anything but open to everyone:** posts leave the feed, the sitemap, search
  and category pages. None of those advertise a page the visitor could not
  open.
- **How fast:** the Posts pages follow a switch change at once. Category pages,
  the feed and a post's listing cards can take up to two minutes, because the
  public page cache keeps an answer that long and the Pages screen belongs to
  the shell, which does not clear it.

## Things to know

- **Dates are shown in UTC** on public pages, so the server and the browser
  print the same day. A post published at 9pm in Toronto shows the next day's
  date on the Posts page, while Admin → Posts shows the admin's own day.
- **A written page can no longer be made at `/posts`.** The page check refuses
  any address a coded page answers on. A written page made at `/posts` before
  this existed is hidden behind the Posts page.
- **A written page under `/posts/`**, such as `/posts/about`, can still be
  saved, but the post route answers that address first, so it never shows.
  Refusing it would mean editing the shell's written-page check.
- **Copying a site** ("new site from existing") copies listings, not posts.
- **Locally**, the feed and the sitemap only answer on a site's own address,
  like `http://my-project.localhost:3015/feed.xml`. Plain `localhost` answers
  404 for both.
