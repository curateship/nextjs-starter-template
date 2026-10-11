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
- **A sound has no picture at all.** Tyler, 10 Oct 2026: "remove all the
  current sound images with a new animated one (but static until played)".
  Every sound card, here and for members, draws a waveform from the sound's
  key (`SoundWave` in `src/components/pomodoro/sound-wave.tsx`), and the
  window has no picture field for a sound. A sound goes Live with its file
  alone. The eight built-in graphics under `public/sounds/` were deleted.
  Older rows still hold their `picture_url`, which nothing reads for a sound
  any more; the column stays because a theme's still lives in it.

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

"Import from Pixabay" sits beside Upload several on both pages. On Sounds the
button reads "Pixabay"; a screen reader hears "Import from Pixabay". On Themes
it is "Pixabay links" in the Import menu, which also holds "YouTube clip" (see
[Make a theme from a YouTube clip](#make-a-theme-from-a-youtube-clip)). One
button holding both keeps the toolbar on one line at 1440px. The admin
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
- **A film** takes Pixabay's large version when it is under 300 MB, else the
  medium one, is copied into the bucket and handed to the catalogue worker
  with its tries counted from nothing. That worker shrinks it to 720p and takes
  the frame halfway through it as the still, the same as an upload. Pixabay's own thumbnail
  is not used, so the still matches the film.
- **Tyler's rule, 9 Oct 2026: "we need to increase file limit for themes".**
  A Pixabay film may be up to 300 MB (`CATALOG_FILM_LIMIT_BYTES` in
  `src/lib/pomodoro/admin-catalog.ts`). It was 100 MB, which refused Pixabay's
  60-second snow film, 226 MB at 1440p and 158 MB at 1080p. Shrinking that
  film to 720p took 38 seconds on two cores of a Mac, well inside FFmpeg's
  four minutes. A film past 300 MB in every size fails with "Pixabay's film is
  over 300 MB in every size it offers."
- **A film the admin uploads stays at 100 MB**, the same as a member's.
  pomoder.com sits behind Cloudflare, which turns away any upload past 100 MB
  before it reaches the server, so only the server's own fetch from Pixabay
  can bring in more.
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

## Make a theme from a YouTube clip

"YouTube clip" in the Import menu on Themes opens a window with a YouTube link
and a "Start at" time. Create theme makes a Draft holding the 5 seconds from
that start, with no sound. Tyler asked on 10 Oct 2026: "Is it possible to add a
theme by enter in a youtube url and the app capture 5 seconds of that video and
add it?"

- **Tyler's rule, 10 Oct 2026: "it should be capturing the 4k version".** A
  clip keeps the video's own size, up to 4K (3840 by 2160), and its own frame
  rate. It is the one film in the catalogue that is not shrunk to 720p:
  uploads and Pixabay films still are. Blender's Big Buck Bunny from 3:00 came
  out 3840 by 2160 at 60 frames a second and 5.4 MB, and a rainy lo-fi scene
  3840 by 2160 at 30 and 7.8 MB.

- **Tyler's rule, 10 Oct 2026: admins only.** Members have no way to make a
  clip. Sounds has no menu either, because a clip is a film.
- **Only the admin's own videos, or ones marked Creative Commons.** A YouTube
  video belongs to whoever posted it, and YouTube's terms forbid downloading,
  so the window says so above the fields. A clip is made with the licence
  "Other, see the note" and the note "From YouTube", never "Free to use", so
  the admin sets the licence on purpose before making it Live.
- **Which links work.** `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`,
  `/embed/` and `/live/`, with or without `www.` or `m.`. A playlist, a
  channel, a search or another site is refused under the field: "That is a
  playlist. Paste one video's link." One reader serves the window and the
  server (`src/lib/pomodoro/youtube-links.ts`).
- **The start.** Typed as `95`, `1:35` or `1:02:05`. Left empty, the link's
  own time is used (`t=95`, `t=1m35s`), and with neither the clip starts at
  0:00. `1:75` is refused rather than read as 2:15.
- **The same stretch is never made twice.** The clip is stored as
  `https://www.youtube.com/watch?v=<id>&t=<seconds>`, in both the source link
  and `import_url`. The same address again is refused under the link: "That
  stretch is already in the catalogue as Big Buck Bunny." Another start of the
  same video is a different scene and is let through.
- **One request, one Draft** (`importThemeFromYoutube` in
  `youtube-import.ts`), with one `catalog_import` audit row. At most 20 clips
  per admin in ten minutes, the same as Pixabay.
- **The row** says "Fetching from YouTube" until the clip arrives, then
  "Preparing the file" while the catalogue worker takes its still. The page
  does not refresh by itself, the same as a Pixabay import.

### Fetching the clip

The `pomodoro-youtube-imports` worker (`youtube-worker.ts`) takes one row per
pass whose `import_url` is a YouTube address. The Pixabay worker takes only
pixabay.com addresses, so neither ever claims the other's row. Both share one
queue (`link-imports.ts`).

- **Two programs, one job each** (`youtube-clip.ts`). yt-dlp, a free program
  that reads YouTube, says what the video is and where its picture-only
  stream lives, choosing the largest up to 4K, and downloads nothing. FFmpeg
  then reads just those 5 seconds from the stream and writes them once, as
  H.264 in an MP4 with no sound, which every browser plays.
- **Why yt-dlp does not cut the clip itself.** It re-encodes into the
  stream's own format, and YouTube's 4K is often VP9 in WebM. For 5 seconds
  of Big Buck Bunny that took 166 seconds of processor time, against 34 this
  way. Inside the worker's own Alpine image the cut took 46 seconds.
- **FFmpeg is only ever pointed at an https stream**, may open nothing but
  secure web connections while reading it (`-protocol_whitelist`), and gets
  only the headers yt-dlp names that hold no line break. A failed cut is logged by
  FFmpeg's last line only, never the signed stream address.
- **yt-dlp uses the worker's own Node** to answer YouTube's checks
  (`--js-runtimes node:<path>`), so nothing else is installed for it.
- **The clip is stored under its own name**, `pomodoro-catalog/sources/youtube-<id>.mp4`
  (`YOUTUBE_SOURCE_PREFIX` in `admin-catalog.ts`). The catalogue worker keeps
  a file with that name as it is, at full size, and only takes the frame
  halfway through as the still. A browser upload can never be stored under
  that name. The video's title becomes the name, cut to 60 characters, and its
  channel the artist. A name or artist the admin typed meanwhile is kept.
- **When YouTube says no.** These fail the row at once, with the reason after
  "File refused:":
  - a start too late: "The video is only 3:20 long, so the clip must start by
    3:15."
  - a live stream: "That video has no fixed length, such as a live stream."
  - a private, removed or age-locked video: yt-dlp's own words, such as
    "Private video. Sign in if you've been granted access".
  - YouTube's bot check: "YouTube refused the server. Tyler has to decide how
    to get round it."
  - no yt-dlp or no FFmpeg: "yt-dlp is not installed on this server", or the
    same for FFmpeg.
- **Anything else is tried again**, once a pass, three times, then "The YouTube
  clip could not be fetched". That covers a timeout, YouTube's "Too Many
  Requests", and a stream it refused after naming the video (a 403).
- **An old yt-dlp is refused by YouTube.** On 10 Oct 2026 version 2026.06.09
  got "HTTP Error 403: Forbidden" on every video, and 2026.08.19 worked. The
  worker installs it from Alpine's packages when its image is built (see the
  repo's `docs/deployment.md`), so a rebuild picks up a newer one. A Mac
  running the dev server needs `brew upgrade yt-dlp` now and then.

## The window

`admin-catalog-dialog.tsx`, three cards:

- **Details.** The name, the hint, the tags, the kind, Free or Pro, and Draft
  or Live. Tags are what members filter the cards by, and tick to shuffle; see
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

## Copied from a member's shared file

Member uploads has "Add to catalogue" in a shared file's sharing menu
(uploads-and-sharing task 05, part 7). It copies the file into the catalogue
as a Draft, with the file's name and tags, the artist "@handle", the file's
page as the source and the licence "other" with a note that the member
confirmed the right to share it. The theme or sound window then opens on it.
The copy goes through the worker below like any upload, so a sound outside 2
to 5 minutes is refused with the usual sentence.

## The worker

`pomodoro-catalog-files` (`catalog-worker.ts`), one file per pass of the
shell's fifteen-second loop, apart from members' uploads so a long film never
holds theirs back.

- **A sound** is measured, refused outside 2 to 5 minutes, then evened out for
  loudness (`loudnorm`) into an MP3.
- **A film** is shrunk to 720p with no sound, apart from a YouTube clip, which
  arrives finished at up to 4K and is kept as it is. The frame halfway through
  it becomes the still, replacing the old one (`extractMiddleFrame` in
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
