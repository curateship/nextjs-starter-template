# Notes and the "/" blocks

Every note in Travel takes blocks as well as words: an activity's notes, the
trip's description, each trip note, and a saved place's notes. Typing "/"
opens a list of them.

## Tyler's rules, 5 Nov 2026

- "Add blocks to tiptap. I want to enter "/" and it list a list of blocks.
  FIrst block is an image block to add images".
- Built "Travel only": the list and the blocks are Travel's own, handed to the
  shell's editor. The shell's own "/" menu for every app is planned in
  `apps/shell/workspace/tasks/features/contacts/block-panels.md` and may
  replace this one later.
- Image takes "Upload from computer, Unsplash search, Paste a web address".
- Place is a "Small card with photo".
- Video takes "YouTube, TikTok, Instagram".
- Map is "Pick cards".
- Link, added 6 Nov 2026 (Travel features 4, part 5), is "Title, picture,
  site".

## The "/" list

- **Where it opens:** a "/" typed at the start of a line or after a space.
  A "/" inside a web address, like `https://kyoto.example/`, never opens it.
- **Two groups,** as in Project's notes (Tyler, 6 Nov 2026: "travel is
  missing some basic blocks. This is project blocks"). Basic blocks: Image,
  Video, Checklist, Callout, Divider, Fold section, Web page and Links.
  Advanced blocks: Place and Map, which point at a trip's cards, and Budget,
  which shows the trip's money. A saved place's notes have none of the three.
- **Each row** is the block's icon and name, with no line under it (Tyler,
  6 Nov 2026: "remove the sub label").
- **Narrowing it:** letters after the "/" keep only the blocks whose name
  starts with them, so "/ma" leaves Map.
- **Keys:** the up and down arrows move through it, and Enter or Tab picks.
  Esc closes it and leaves the "/" as typed. So does a click anywhere else.
- **The cursor stays in the note** the whole time. Clicking a row in the list
  doesn't take it out.
- **With no signal** the note can't be written in, so there is no list.
- **Right-click** in a note opens the same list at the pointer, and the block
  picked goes where the click was (the Admin 3 panel design, 6 Nov 2026, as in
  Project's notes). With words selected, or on a block itself, the browser's
  own menu stays, for Copy. A click elsewhere or Esc closes it.

## The blocks

Checklist, Callout, Divider, Fold section and Links came from Project's notes
on 6 Nov 2026 and work as they do there:

- **Checklist:** ticked lines; a ticked line is struck through. A tick is
  only a tick.
- **Callout:** a tinted box of words. Its icon changes it between Note,
  Warning and Decision. Enter on an empty last line leaves the box.
- **Divider:** a thin line across the note.
- **Fold section:** a heading with an arrow that hides what's under it, up
  to the next Fold section. Folding is yours alone, kept in this browser,
  never saved in the note.
- **Links:** labelled web addresses, one a line, each opening in a new tab,
  up to 30. The cog adds and removes them.
- **Web page** is the block that was called Link: a page as a small card
  with its title, picture and site. It is still stored as `noteLink`.

- **Budget** (Tyler, 7 Nov 2026: "turn this bottom card into a budget
  block") is the Money card that sat in the trip's left panel's footer. It
  is offered in every note on a trip: the description, the trip's notes and
  each card's notes.
  - **Its heading** reads "Budget: CA$181,400 of CA$2,000": the total of
    every cost on the trip's days against the budget (Tyler, 7 Nov 2026:
    "make the header "Budget: $54 of $ 100""). With no budget it reads
    "Budget: CA$181,400". It is 12.8px, 20% under the 16px it started at
    (Tyler, 7 Nov 2026: "reduce header font by 30%", then "increase by 10").
  - **It folds** from a click on its heading, with no arrow (Tyler, 7 Nov
    2026: "Add collapsible to budget", then "clicking on header to toggle is
    enough"). The fold is remembered
    in this browser, for every Budget block at once, and works in a note that
    can't be written in too.
  - **Opened, it shows** a bar that turns red over budget with how far over,
    the Budget field, then the By day and By type tabs. By day is a line per day. By type is a line per activity type
    with its icon, biggest first; cards with no type, or a removed one, count
    under Other. Costs in Ideas are listed apart and not counted. A stay
    counts once, on its first day.
  - **The box** is solid light grey, as Project's Daily card block is, with
    no ring when it's selected, since a click on its field or tabs selects
    the block.
  - **Its bin** sits at the heading's right, where the arrow was ("replace
    toggle with the trash icon"). It shows while the block is pointed at, as
    other blocks' bins do, and always on a phone.
  - **One trip, one budget.** The budget typed in any Budget block is the
    trip's, so every Budget block on the trip shows the same numbers. The tab
    picked is remembered in this browser for all of them.
  - **One per note.** Picking Budget in a note that already has one takes
    the "/" away and scrolls to the one there.
  - **A note that can't be written in** shows the block with its field
    turned off.
- **Image.** An empty Image block opens in the note with three ways in: an
  upload box (the shell's media library), the Unsplash button, and a "Web
  address" field. A web address has to start with `https://`. An Unsplash
  picture always shows its credit line under it, as Unsplash's rules ask, and
  picking one tells Unsplash it was used. A picture whose address stops
  loading shows "This picture no longer loads".
- **Place.** Picking Place opens a window listing the trip's cards day by day,
  with Ideas last, and a search. Picking a card puts a small card in the
  note: its picture (or its type icon), its name, its day and its time.
  Clicking it opens the card in the right panel. A card renamed later shows
  its new name. A card deleted or in the bin shows "Removed: this card is no
  longer on the trip" and opens nothing.
- **Video.** An empty Video block asks for a link. It takes YouTube links
  (including Shorts), full TikTok links (`tiktok.com/@name/video/…`), and
  Instagram reels and posts. Any other link gets "Paste a YouTube, TikTok or
  Instagram link." A short TikTok link (`vm.tiktok.com`) gets told to open it
  and paste the full one, because the short one can't be read without going
  to TikTok first. The block shows a still with a Play button, and the player
  only loads once it is clicked, so a note with several videos opens fast.
  YouTube gets a real still; TikTok and Instagram give none without a key, so
  theirs is a plain box with the site's name. Pointing at a video shows an
  "Open on YouTube" (or TikTok, or Instagram) button in its corner, beside the
  bin, for when a player won't load. Tyler, 5 Nov 2026: "the open on youtube
  text link should be a hover over".
- **Map.** Picking Map opens the same card window with tick boxes. Only cards
  with a place on the map can be ticked, and a map holds up to 25. The block
  draws them on a small Google map, numbered in the board's order and
  coloured by day like the Map tab, with Ideas in grey, and lists them under
  the map. Its cog reopens the window to change the cards. Clicking a pin
  opens that card. With no browser map key the map says what's missing, as
  the Map tab does.
- **Link.** An empty Link block asks for a web address. A bare one such as
  `example.com` is fine (Tyler, 6 Nov 2026: "I shouldnt need to type
  https:// to enter a link. just whatever.com is fine"): `https://` goes in
  front of it, and an `http://` address is read as `https://`. A word with no
  dot, such as "ramen", isn't taken as an address.
  Add asks the server to read the page once: its title, picture and site
  name, from the page's own `og:title`, `og:image` and `og:site_name`, or its
  `<title>` and the site's address when it gives none. The block keeps what
  was found, so opening the note never fetches the page again. It draws as a
  small card, the picture on the left like a Place block, then the title and
  the site, and opens the page in a new tab. A page that doesn't answer in 5
  seconds, isn't a web page, or says nothing about itself still makes a card,
  with the site's name and the address.
  - **What it refuses:** an address that isn't a web page's (such as
    `ftp://`), and one that
    points inside a private network, such as `localhost` or `192.168.1.1`,
    or a name that looks up to one. The server checks every address a name
    looks up to, then connects to the one it checked, so a second lookup
    can't send it elsewhere. Redirects are followed one at a time, each
    checked again, at most 3; one into a private network leaves the card as
    pasted. Only the first 256 KB of a page is read. These are the shell's
    webhook checks (`src/server/automations/net-guard.ts`).
  - **One person reads at most 60 pages in 10 minutes.**
- **A note on no trip** (a saved place's) offers no Place, Map or Budget,
  since they point at a trip's cards or its money.
- **A selected block** (clicked once, ready for Backspace) gets a faint ring
  round its picture, player, card or map only, following its corners. There's
  no box round the whole block and its links: Tyler, 5 Nov 2026, "this ui
  outline here is really ugly".
- **Links inside a block,** like an Unsplash credit, stay small and grey. The note's own link colour is for links in the writing.
- **Removing a block:** each block has a bin that shows while it's pointed at,
  focused or selected (always on a phone). Selecting a block and pressing
  Backspace removes it too.
- **A block not filled in is never saved.** An Image with no picture or a
  Video with no link stays only until the note is closed, and a note with no
  signal never shows one.

## Copying a note

- **Copy trip** points the Place and Map blocks in the trip's description and
  in each card's notes at the copies, not at the old trip's cards. The trip's
  own notes aren't copied, as before.
- **Copy trip** keeps the Budget blocks, which then show the copy's money.
- **Saving a place, adding a saved place to a trip, and Go again** copy a
  card's notes too. Its Place blocks go, and so do its Map blocks, because
  they point at cards on the old trip. Words, pictures and videos stay.
  Saving a place also drops its Budget block, since a saved place has no
  trip.

## What a saved note may hold

- **Words:** what a shell written page may: paragraphs, headings, lists,
  quotes, bold, italic, strikethrough and links. The shell's rule cleans these.
- **Blocks:** only the ones above, each with only its own few values. A
  Callout keeps its kind and only paragraphs and lists inside; a Checklist
  line keeps whether it is ticked; a Fold section keeps its id and its
  heading's words; Links keeps up to 30 `https://` addresses with up to 80
  characters of words each; a Divider keeps nothing. An
  Image keeps its address (`https://` only), its description and its
  Unsplash credit. A Place keeps one card id. A Video keeps its plain link,
  rewritten from what was pasted, and the player's address is always built
  from that link, so a note can only ever play those three sites. A Map keeps
  up to 25 card ids. A Link keeps its address and picture (`https://`
  only), a title of up to 200 characters and a site name of up to 100. A
  Budget keeps nothing, because it reads the trip.
  Anything else is dropped.
- **The same cleaning runs twice:** in the editor on every change, and on the
  server before every save, so a note sent by hand can't hold more.

A pasted web address means the note loads a picture from that address when
it opens, and so does a Link block's picture. Only the note's own writer ever sees a trip's notes, so it's their
own choice of address.

## Where it lives

- `src/lib/travel/note-blocks.ts`: what a note may hold, and reading pictures
  out of a note for the Photos tab.
- `src/lib/travel/video-links.ts`: reading the three sites' links.
- `src/components/travel/note-slash.ts`: the "/" that opens the list.
- `src/components/travel/use-note-blocks.ts` and `note-blocks-menu.tsx`: the
  list, and the card window it opens.
- `src/components/travel/note-block-nodes.ts` and `note-block-views.tsx`: the
  blocks; `note-folds.ts`: which Fold sections this reader has folded;
  `trip-budget-card.tsx`: what the Budget block draws.
- `src/server/travel/link-preview.ts`: reading a Link block's page, behind
  `src/lib/api/travel/link-preview.ts`.
- `src/components/travel/note-card-picker.tsx`: the card window for Place and
  Map.
- `src/components/travel/saving-document.tsx`: hands all of this to the shell's
  editor through its `extensions` and `clean` props
  (`docs/shell/document-editor.md`).
