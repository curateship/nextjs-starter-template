# Themes and sounds in the admin

The themes and sounds members pick from live in the database, and an admin adds,
edits, orders, prices, hides and deletes them on two admin pages, Themes and
Sounds. A change reaches members on their next page load, with no deploy. Tyler
asked for this on 8 Oct 2026: "Media should be in 2 dashboard, one for themes
and one for sounds. Add ability to add sound and theme in admin dashboard
(click title and settings cog to open modal to add/edit)."

## Tyler's rules

- **Every sound runs 2 to 5 minutes.** Tyler, 8 Oct 2026: "It should change
  when the sound ends and because of that, we have to make each sound 2-5 mins
  each." The browser refuses a file outside that before sending it ("This sound
  is 0:48. Sounds need to run 2 to 5 minutes."), and the worker measures it
  again with FFprobe and refuses it there too. The eight sounds that shipped
  with the app run 44 to 53 seconds and were copied in as they were. They need
  longer versions before shuffle (`03-shuffle-tags-and-defaults.md`) ships.
- **A Draft or deleted item falls back at once.** Tyler, 8 Oct 2026. Anybody
  who had it in their personal room or a room gets the default scene (Lofi
  girl) or silence on their next load. Their saved choice is left as it was,
  so it comes back if the item is made Live again.

- **A theme's still is never uploaded; it comes from the middle of its
  film.** Tyler, 9 Oct 2026: "remove the ability to add a still image and just
  let the app capture an image in the middle of the clip". The theme window
  has no Still field. It shows the still the worker took, or "Taken from the
  middle of the film once it is prepared." Every new film brings a new still,
  and the old one leaves the bucket. The server ignores a still sent with a
  theme save, so nothing but the worker sets it.
- **Themes made before that rule caught up on their own.** Tyler, the same
  day: "lofi girl still shows old image". When the worker has no new file
  waiting, it takes one theme whose film is in the bucket but whose still was
  not taken from the middle of it, and replaces the still with the film's
  middle frame. Nothing is re-encoded. A middle still is stored as
  `pomodoro-catalog/themes/middle-<id>.jpg`, which is how the worker tells it
  from an older first frame (`findThemeNeedingMiddleStill` in
  `admin-catalog.ts`). A film that fails is skipped until the worker restarts.
- **Lofi girl's still ships with the app.** Its film lives under `public/`,
  where the worker cannot reach it, so `public/backgrounds/thumbs-lofi_girl.png`
  was replaced by hand with the frame at 30 seconds of its 60-second film. It
  used to be a 120 by 72 drawing.
- **A sound never needs a picture uploaded.** Tyler, 9 Oct 2026: "It
  shouldnt need to upload an image when i add a sound. It should add one of
  the random graphic we currantly have." A sound saved with no picture, from
  New sound, Upload several or a Pixabay music link, gets one of the eight
  built-in sound graphics (`SOUND_GRAPHICS` in
  `src/lib/pomodoro/admin-catalog.ts`, files under `public/sounds/`) at
  random. The admin can still choose a picture of their own in the window.

## Where the list lives

- **`pomodoro_catalog_items`**, migration `0123_pomodoro_catalog_items.sql`.
  One row per theme or sound: name, hint, kind, Free or Pro, Draft or Live,
  position, the file and the picture, credits, starting volume, and where the
  worker has got to with a new file.
- **The sixteen built-in items** were copied in with the keys they always had,
  so every saved `scene:<key>` and `curated:<key>` kept working. Their files
  stay under `public/`, where they ship.
- **A key never changes.** It is made from the name when an item is created
  ("Rain on a tin roof" becomes `rain-on-a-tin-roof`, then `-2` if taken),
  because every saved choice points at it.

## How a page gets it

- **The server reads the Live items** (`loadMediaCatalog` in
  `src/server/pomodoro/catalog.ts`), holds the answer for five seconds, and
  drops it the moment an admin saves anything.
- **It travels with the room media bootstrap**, the same data that already
  carries the theme and sound of the room you are in, so the server and the
  browser draw from the same list and the first frame is still right. A
  member's comes from `loadRoomMediaBootstrap`. A guest's comes from
  `loadGuestMediaBootstrap`, the one door here open without an account
  (`src/app/open-endpoints.ts`), which also picks the guest's random free pair.
- **Pages read it with `useMediaCatalog()`** (`room-media-store.ts`): the
  Sounds and Theme pages, the room pickers, the room cards, the invite page,
  the profile banner picker and the plan cards' counts.
- **A saved choice is filled in from the list.** `resolveSoundReference` and
  `resolveBackgroundReference` attach the file, the name and the volume, so
  the player and the backdrop play what they are handed. An item the list does
  not have resolves to nothing, which is the fall-back above.
- **Every save checks the list on the server.** A personal room, a hosted room
  and a profile banner refuse an item that is not Live.

## The two pages

`/admin/pomodoro-themes` and `/admin/pomodoro-sounds`, one component
(`admin-catalog-dashboard.tsx`). `/admin/pomodoro-media` forwards to Themes.

- **A row** shows the picture, the name, its kind, a sound's length, Free or
  Pro, a note while a new file is being prepared, or "File refused:" with the
  reason, "No licence set" on a Live item with none, Draft or Live, and how
  many personal rooms and open rooms have it.
- **The name or the cog opens the window**, with `?open=<id>` in the address,
  so Back closes it. New theme or New sound opens it with `?open=new`.
- **A sound row has a play button** that plays in the page only and stops when
  another plays.
- **A tag filter** sits beside Draft or Live and Free or Pro once anything is
  tagged.
- **Ticked rows** get Delete, Free, Pro, Draft and Live. One press is one
  request, and the line afterwards counts what changed, what was already that
  way, and what could not go Live because it has no picture or no file.
- **Rows drag into the order members see** while the list is in that order,
  unfiltered and on one page. Otherwise a line under the table says so, with a
  button back to members' order.
- **Upload several** takes up to 25 files. Each becomes a Draft named after
  its file. On Sounds, a file outside 2 to 5 minutes is left out and counted.
  On Themes, a picture becomes a still at once and a film is prepared by the
  worker.

## Import from Pixabay

"Import from Pixabay" sits beside Upload several on both pages. The button reads
"Pixabay" so the toolbar stays on one line at 1440px; a screen reader hears
"Import from Pixabay". The admin
pastes up to 25 pixabay.com page links, one per line, and each good link
becomes a Draft with its name, source link and the licence "Free to use"
(note "Pixabay Content Licence") already filled in. Tyler asked for this on
9 Oct 2026: "Need a feature to place a list of url to scrape theme and sound
from pixabay."

- **Tyler's rule, 9 Oct 2026: a music link makes a half-way Draft.** Pixabay
  has no music API, its pages answer a server with a 403 and a Cloudflare
  check, and its terms (section 8) forbid scraping and getting round its
  blocks. So a music or sound-effect link makes a Draft with the name, source
  link and licence, and nothing is ever fetched from pixabay.com for a sound.
  The admin downloads the MP3 from Pixabay and drops it in the sound's window.
- **Which links each page takes.** Themes takes `/photos/` and
  `/illustrations/` (a still) and `/videos/` (a film). Sounds takes `/music/`
  (music) and `/sound-effects/` (ambient, because the rain and fire loops live
  there). `/vectors/` is refused on both. A language in front
  (`/de/photos/…`), `www.` and a query string are ignored.
- **Each line's problem shows under the box as it is typed**: "Line 4 is not a
  pixabay.com link.", "Line 2 is a photo, paste it on Themes.", "Line 3 is a
  number, not the page link.", "Line 5 is a search, not one item.", "Line 6
  repeats line 1." Import sends only the good lines, and the server reads them
  again (`src/lib/pomodoro/pixabay-links.ts`, one reader for both).
- **The name** is the link's slug with the id taken off and a word repeated
  back to back said once, so `lofi-lofi-chill-vlog-beats-573883` reads "Lofi
  chill vlog beats".
- **The same item is never imported twice.** The server compares the id
  against every Pixabay source link in the catalogue, Draft or Live, of either
  kind, and refuses a repeat with "is already in the catalogue as Forest fog".
  Photos, films and sounds each count their own ids, so photo 28470 and film
  28470 are different items.
- **The result line** copies Upload several: "18 themes added as drafts. 2
  were refused: line 4 is not a pixabay.com link; line 9 is already in the
  catalogue as Forest fog." Sounds add "Each needs its file from Pixabay." With
  more than three refusals, or none added, the window stays open holding only
  the refused lines, each reason under the box, and the toast gives counts.
- **Themes need the Pixabay API key**, saved on Settings → Pixabay (see
  [Admin settings](admin-settings.md)). With none, the window opens and says
  "Add the Pixabay API key in Settings → Pixabay first." with a button there.
  Sounds never call Pixabay, so they need no key.
- **Every import is one request** (`importFromPixabay` in
  `pixabay-import.ts`), one transaction, and one `catalog_import` audit row
  listing the new items. At most 20 imports per admin in ten minutes, because
  Pixabay asks for no mass downloading.

### Fetching a picture or film

The `pomodoro-pixabay-imports` worker (`pixabay-worker.ts`) takes rows that
still have `import_url` set, up to five pictures or one film per pass of the
fifteen-second loop, so 25 photos take about a minute. The row says "Fetching
from Pixabay" meanwhile.

- **A picture** is looked up by id on Pixabay's API (`pixabay.ts`), its
  `largeImageURL` is copied into the bucket, and it becomes the still. A
  default key gives pictures 1280 pixels wide.
- **A film** takes Pixabay's large version when it is under 100 MB, else the
  medium one, is copied into the bucket and handed to the catalogue worker
  with its tries counted from nothing. That worker shrinks it to 720p and takes
  the frame halfway through it as the still, the same as an upload. Pixabay's own thumbnail
  is not used, so the still matches the film.
- **Both fill in the credits** from Pixabay's answer: the artist (the Pixabay
  user), the source link, the licence, and the tags from Pixabay's tag list,
  cut to the usual eight. A field the admin filled in while the file was on its
  way is kept.
- **Only Pixabay's file servers are fetched from.** The file address must be
  https on a host ending in pixabay.com, one redirect is followed at most, to a
  host that passes the same check, and a file past its size limit is refused
  while it arrives.
- **When Pixabay says no.** An unknown id fails the row with "Pixabay has no
  item 195893", and a refused key with "The Pixabay API key was refused. Check
  it in Settings → Pixabay.", neither tried again. Too many requests puts the
  row back without using one of its three tries and ends the pass. A failed
  download is tried three times, once a pass, then "Pixabay's file could not
  be fetched".
  The row shows "File refused:" with the reason, and the admin can upload a
  file of their own in its window.
- **The admin's own file wins.** Uploading a file in the window while a fetch
  is waiting stops the fetch.

### A sound waiting for its file

- **The row** says "Needs the file from Pixabay" with an "Open on Pixabay"
  link that opens in a new tab. The window's Files card says the same, with
  the link, in place of "No file yet."
- **Choose file in the window** is where the MP3 goes. Save queues it through
  the usual 2-to-5-minute check and the worker. There is no upload button on
  the row; the cog is one click away.
- **Live is refused until the file is ready**, by the check every sound
  already has.

## The window

`admin-catalog-dialog.tsx`, three cards:

- **Details.** The name, the hint, the tags, the kind, Free or Pro, and Draft
  or Live. Tags are what members pick by on the By tag tab; see
  [Shuffle and tags](shuffle-and-tags.md).
  Making something Pro does not take it from a free member who already has it;
  it is checked the next time they pick.
- **Files.** For a sound, the card picture (the shared image field and media
  library), then the sound file. For a theme, its still, shown and never
  chosen, then its film. A file is uploaded the moment it is chosen and
  prepared after Save. A sound has a starting volume from 10 to 100,
  multiplied into each member's own volume. A theme's film can be replaced but
  not dropped, because the still comes from it.
  A theme with a film shows a player under "Film" (the browser's own, as the
  media library uses), the same size as the still, so the admin can watch the
  film members get before making it Live. While a new film is being prepared
  the player still plays the current one.
- **Credits.** Artist, source link, licence and a note. Only admins see them.

Delete sits hard left in the footer. It closes the window and asks in the
page's own confirm, which says how many people and open rooms have the item and
what they get instead. The item's uploaded files are removed from the bucket;
the built-in files under `public/` never are.

Going Live needs a picture, and for a sound a file (or one on its way). A
sound always has a picture, because one of the built-in graphics is picked
when none is given. A
theme gets its still from the middle of its film once the worker has prepared
it, so a new theme can be saved Live while its film is on the way.

## The worker

`pomodoro-catalog-files` (`catalog-worker.ts`), one file per pass of the
shell's fifteen-second loop, apart from members' uploads so a long film never
holds theirs back.

- **A sound** is measured, refused outside 2 to 5 minutes, then evened out for
  loudness (`loudnorm`) into an MP3.
- **A film** is shrunk to 720p with no sound, and the frame halfway through it
  becomes the still, replacing the old one (`extractMiddleFrame` in
  `media-transcode.ts`). A film whose length FFprobe cannot read gives its
  first frame instead.
- **The item keeps its old file until the new one is ready.** A Live sound
  being replaced keeps playing; a refused replacement leaves the old one in
  place and says why in the window.
- **A worker with no FFmpeg** marks the file refused with that reason rather
  than trying again.

## The NEW label

A theme or sound made Live in the last 14 days shows NEW beside its name on the
member pages, in the same orange capitals as PRO. The days count from when it
first went Live (`published_at`), not from when it was made as a Draft or last
edited. The built-in items carry a 1 Jan 2026 date, so they never show it.

## Every change is on record

Each save, delete, price change, status change and reorder writes one
`pomodoro_audit_logs` row with the resource `catalog` in the same transaction.
