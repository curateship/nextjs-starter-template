# Notes and the "/" blocks

Every note in Travel takes blocks as well as words: an activity's notes, the
trip's description, and each trip note. Typing "/" opens a list of them.

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

## The "/" list

- **Where it opens:** a "/" typed at the start of a line or after a space.
  A "/" inside a web address, like `https://kyoto.example/`, never opens it.
- **Narrowing it:** letters after the "/" keep only the blocks whose name
  starts with them, so "/ma" leaves Map.
- **Keys:** the up and down arrows move through it, and Enter or Tab picks.
  Esc closes it and leaves the "/" as typed. So does a click anywhere else.
- **The cursor stays in the note** the whole time. Clicking a row in the list
  doesn't take it out.
- **With no signal** the note can't be written in, so there is no list.

## The blocks

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
- **Saving a place, adding a saved place to a trip, and Go again** copy a
  card's notes too. Its Place blocks go, and so do its Map blocks, because
  they point at cards on the old trip. Words, pictures and videos stay.

## What a saved note may hold

- **Words:** what a shell written page may: paragraphs, headings, lists,
  quotes, bold, italic, strikethrough and links. The shell's rule cleans these.
- **Blocks:** only the four above, each with only its own few values. An
  Image keeps its address (`https://` only), its description and its
  Unsplash credit. A Place keeps one card id. A Video keeps its plain link,
  rewritten from what was pasted, and the player's address is always built
  from that link, so a note can only ever play those three sites. A Map keeps
  up to 25 card ids. Anything else is dropped.
- **The same cleaning runs twice:** in the editor on every change, and on the
  server before every save, so a note sent by hand can't hold more.

A pasted web address means the note loads a picture from that address when
it opens. Only the note's own writer ever sees a trip's notes, so it's their
own choice of address.

## Where it lives

- `src/lib/travel/note-blocks.ts`: what a note may hold, and reading pictures
  out of a note for the Photos tab.
- `src/lib/travel/video-links.ts`: reading the three sites' links.
- `src/components/travel/note-slash.ts`: the "/" that opens the list.
- `src/components/travel/use-note-blocks.ts` and `note-blocks-menu.tsx`: the
  list, and the card window it opens.
- `src/components/travel/note-block-nodes.ts` and `note-block-views.tsx`: the
  four blocks.
- `src/components/travel/note-card-picker.tsx`: the card window for Place and
  Map.
- `src/components/travel/saving-document.tsx`: hands all of this to the shell's
  editor through its `extensions` and `clean` props
  (`docs/shell/document-editor.md`).
