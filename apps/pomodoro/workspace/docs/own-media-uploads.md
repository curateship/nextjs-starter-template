# Your own backgrounds and sounds

A Pro member uploads their own picture, clip or sound loop, and it appears in
the picker beside the eight that ship with the app.

## My uploads

A member's own backgrounds and sounds, and the AI generator for each, have a
page of their own at `/uploads`. Tyler, 10 Oct 2026: "The upload your own and
ai generated needs its own page. Link to it from the avatar dropdown", and
"Remove the upload your own and ai generated card from themes and sounds".

- **Three tabs, Backgrounds, Sounds and Bin**, in the round pill style
  beside the title. `?kind=sound` opens the Sounds tab and `?kind=bin` the
  bin, and switching tabs rewrites the address.
- **Three ways in.** "My uploads" in the photo menu, between Settings and
  Your profile. A "+ Add" in the same round tray as Shuffle, beside it on
  `/backgrounds` and `/sounds`, opening the matching tab; on a phone it wraps
  under the tag filter. And the bell's "Your upload is ready" and "AI credits"
  notices, which now link to the matching tab.
- **Backgrounds and Sounds list only the catalogue** now, with no upload or
  generator card under the grid.
- **Managing the files** (marks, tick boxes, the bin, stills for clips, the
  space warning, Download) is in [My uploads](my-uploads.md).

## The "Your own" card

On each tab of My uploads the uploads sit in one card, drawn to Tyler's
Sounds design of 7 Oct 2026: a "YOUR OWN" heading with the space used
beside it ("4.3 MB of 2.0 GB"), two buttons, the file limits under them, and
the uploads in a grid once there are any.

- **Two buttons, no drop box.** Tyler, 7 Oct 2026: "remove the upload box
  ... Clicking the button is enough." Sounds has Upload sound and Generate
  with AI. Theme has Upload clip and Generate with AI. Dragging a file onto
  the page does nothing.
- **Upload opens the upload window**, described below. The file is chosen
  inside it.
- **Generate with AI scrolls to the generator card** further down the same
  tab, and puts the cursor in its prompt when the prompt is open to you
  (`useGeneratorJump` in `src/lib/pomodoro/use-generator-jump.ts`).
- **The cards are drawn like the catalogue's.** Tyler, 10 Oct 2026: "it needs
  to look similiar in size and structure". A sound is a Sounds card (a wide
  waveform picture, the name in bold, the "+" beside it) and a picture or clip
  is a Theme card. The cog and the bin sit on the picture's top corner, so the
  name keeps its room, and "Currently selected" moves to the picture's foot.
  A finished file shows its name alone; a line under it appears only for
  "Getting it ready…", "Making the new cut…" or a failure. A sound plays on a
  click, never on hover; a clip plays on hover.
- **A sound's card is the same moving waveform as the catalogue's sounds**,
  drawn from the upload's id, so it keeps its shape between visits. It is
  still until the sound plays. AI soundscapes get one too. See "The card" in
  [Sounds](sounds.md).
- **Upload is never dead.** A guest sees Sign in in its place. On a free
  account it shows a padlock and opens the plans. On a full account it says
  to delete something first, in the line under the buttons. While the page is
  still asking, it shows a spinner.

## What is allowed

| Kind | Types | Largest |
| --- | --- | ---: |
| Picture | PNG, JPG, WebP | 10 MB |
| Sound | MP3, WAV, OGG | 30 MB |
| Video | MP4, WebM | 100 MB |

Two gigabytes per person in total, counted across every file the account owns,
because every file sits in one bucket and the number a member is shown has to be
the number that runs out. The limit itself comes from the plan
(`storageLimitBytes` in the Pro perks), so a plan can change it without a code
change.

### 10 GB more for a year

A Pro member can buy 10 GB more for $5, once, lasting 12 months (task 07,
Tyler's choice of 10 Oct 2026 over a monthly add-on; how buying works is
"Buying more" in [Pro perks](pro-perks.md)). The space is added to the plan's
own limit for the year (`loadBoughtSpace` in
`src/server/pomodoro/bought-space.ts`, read by `loadPomodoroEntitlements`), so
every check that reads the limit sees it: the upload window, the server, AI
files and the 90% warning.

- **"Get 10 GB more for $5"** sits beside Upload and Generate with AI once
  the space is 90% full, the point where the bell warns, while payments are
  switched on. The bell's warning then also says "or get 10 GB more".
- **The heading says how long it lasts**: "2.1 GB of 12 GB, 10 GB bought
  until 10 October 2027".
- **When the year ends nothing is deleted.** A member left over the plan's
  own space is told under the buttons, without pressing anything: "Your extra
  10 GB ended on 10 September 2026. Nothing was deleted, but uploads are off
  until you are back under 2.0 GB." Uploads and AI files are refused until
  then, by the same check as a full account.
- **Two purchases each count for their own year**, so buying again inside a
  year adds another 10 GB rather than moving the date.

Three refusals, each with a plain sentence rather than a code:

- **The bytes do not match the claim.** A text file renamed to `.png` is turned
  away. The browser's file type is only what the operating system guessed from
  the extension, so the first bytes of the file are what the server believes.
- **It is too big**, against that kind's limit.
- **It is the wrong kind for the picker.** A background takes pictures and
  video; a sound takes audio.

**The window turns a file away before it uploads when it already knows the
answer.** Picking a file over its kind's limit, bigger than the space left, or
of the wrong kind for the page shows the reason on that file's own row, and
that file is never sent: "This picture is 11 MB. Pictures can be up to 10 MB."
or "This clip is 50 MB and you have 40 MB of space left." (`uploadRefusal` in
`media-limits.ts`). The space is counted down the list in order, so two files
that each fit but not together refuse the second one, and removing the first
frees its space for the rest. The kind comes from
the browser's file type, image, audio or video. A file the browser could not
type gets only the space check, and the server judges it by its bytes. The
server checks the same numbers again and has the last word, so the browser
check is a courtesy and never the rule. A 150 MB clip used to upload for a
minute before being refused.

A request that never says how big it is is refused before a byte is read. That
is how a chunked upload arrives, and its size cannot be checked until the whole
body is already in memory, which is the hole it would otherwise open.

## The upload window

Tyler's ask, uploads-and-sharing task 01 (10 Oct 2026). Before it, the name on
a card was the file name ("IMG_4021.mp4"), nothing could be tagged or shared,
and the only progress was words on the button.

- **One window on both pages.** "Upload sounds" on `/sounds`, "Upload
  backgrounds" on `/backgrounds`. Choose files opens the file picker inside it,
  and Upload with nothing chosen opens the picker too.
- **Up to ten files at once**, sent one after another. Picking more says how
  many were left out. Each file is its own card with a remove button until it
  goes.
- **Name** starts as the file name without its extension ("IMG_4021"). The
  server trims it and refuses an empty one with "Give it a name." It holds 80
  characters.
- **Tags** are words separated by commas, with the tags already in use one
  click away: those on Live catalogue items of the same kind, then the
  member's own. They follow the catalogue's rules. They are stored in lower
  case, at most eight, each up to 24 characters of letters, numbers, spaces
  and dashes. A word that breaks the rules is refused with a sentence, never
  dropped quietly. A tagged file can play in shuffle once its tag is ticked
  in Show & shuffle; see "Your own files join by their tags" in
  [Shuffle and tags](shuffle-and-tags.md).
- **Tags for every file** appears with two or more files still to send.
  Typing there fills every file's own tags, except a file whose tags were
  changed by hand.
- **Share this** starts unticked. Ticking it shows a second tick, "I made
  this, or I have the right to share it", and both are needed. What sharing
  does is in [Shared sounds and backgrounds](shared-media.md).
- **Upload is the one orange button.** It reads "Upload 3 files" when there are
  several. Name and tag problems show under that file's fields, and nothing is
  sent until they are fixed.

### Trim

A sound or a clip has a Trim button that opens a preview player with two
handles on a strip under it. Moving either handle moves the player's time to
that point, so the right handle shows where the clip will end. Pressing play
starts at the left handle and stops at the right one, so what you hear is what
you keep.
The line under the strip says "Starts 0:05, ends 0:15. 0:10 kept."

- **Nothing is cut in the browser.** The whole file goes up with a start and an
  end in milliseconds, and the worker cuts while it re-encodes (`-ss` and `-t`
  before the input, so the cut lands on the exact frame).
- **The space check counts the whole file sent**, not the cut length, because
  the whole file stays in the bucket as the original (see "The cog" below).
- **At least one second is kept.** The handles cannot get closer, and the
  server refuses anything shorter or a trim on a picture.
- **The handles move a tenth of a second at a time**, and the line under them
  shows tenths ("Starts 0:05.3"), so each arrow-key press shows. Within a
  tenth of either end counts as the end, so a 12.345-second file can still be
  set back to the whole file. A screen reader hears the strip as "Trim".
- **The handles lock while the file goes up**, so the file is always sent
  with the trim on screen.
- **A file the browser cannot play** (an OGG in Safari, say) says it cannot be
  trimmed here and uploads whole.
- Moving both handles back to the ends sends no trim at all.

### The bar

A bar inside the file's card fills from 0 to 100% while the file goes up,
labelled "Uploading Rain on my window" with the percentage beside it. Once
every byte is out it reads "Checking the file…" while the server sniffs and
stores it. With the upload held to 250 KB a second, a 1.1 MB clip's bar read
2, 12, 17, 24 and so on up to 100, a new figure every quarter second.

- **The same server function sends it.** `fetch` cannot report upload progress,
  so `uploadPomodoroMedia` hands the server function a `fetch` built on
  `XMLHttpRequest` (`fetchWithUploadProgress` in
  `src/lib/api/pomodoro/media-uploads.ts`). The address, the origin check, the
  cookies and the error codes are the ones every other call uses, and refusals
  still go through `getPomodoroUploadErrorMessage`.
- **A screen reader hears it in quarters**: "Uploading, 25%", 50, 75, then
  "Uploaded. Checking the file." Reading every percent aloud would talk over
  everything else.

### Cancel

Cancel in the footer stops the file going up. The browser drops the
connection, the server never gets the whole body, and nothing is stored: no
library row, no bucket file, no change in space used. The window goes back to
the filled form with every field as it was. Cancelled at 40%, the space used
stayed 6.8 MB and the card count stayed two.

- **Cancel during "Checking the file…" lets that file finish.** Every byte is
  already on the server by then and it is being stored, so Cancel stops the
  files after it instead.
- **Closing the window mid-upload asks first**: "Stop uploading?", with Keep
  uploading and Stop uploading. Files already uploaded stay.
- **Closing with files chosen but not sent asks too**: "Discard these files?"
  A window holding only finished or refused files closes at once.

### Being prepared

After a file is up, its card turns into one line saying what happens next.

- **A picture** says "Your picture is ready."
- **A sound or clip** counts the files the worker will prepare first, across
  every member, because the worker takes them oldest first, one every fifteen
  seconds: "Your clip is being prepared. 2 files are ahead of it, so it should
  be ready in about a minute. The bell will tell you." (`uploadedMessage` in
  `src/lib/pomodoro/upload-labels.ts`). Two clips uploaded in a row showed the
  second with "1 file is ahead of it".
- **The wait is the files ahead plus one, times fifteen seconds.** Under 40
  seconds says "in under a minute", up to 90 "in about a minute", and past
  that the minutes rounded, so the tenth of ten clips says "in about 3
  minutes".
- When nothing is left to send, the footer is a single Done that closes the
  window. The card grid behind it has already re-read its list after each file.

### AI fills in the name

When a file is picked, the window asks for a name and two or three tags from
the file name, one small call per file (`suggestUploadLabels` in
`src/server/pomodoro/upload-labels.ts`). "Suggesting a name…" shows beside the
Name label while it waits.

- **Claude Haiku 4.5**, booked on the AI usage page as "pomodoro upload labels"
  against the member's AI allowance. A fraction of a cent per file.
- **Tags come from the known list first.** The prompt offers the same tags the
  window does, and known ones are put before new ones in the answer.
- **Only untouched fields take it.** A name typed before the answer arrives is
  kept, and so are tags typed by hand or for every file.
- **Anything going wrong says nothing**: no key, the allowance spent, a slow
  call (10 seconds), an answer that is not JSON, or a camera name like
  IMG_4021 that says nothing. The fields keep the file name and no tags.
- **The file name is passed as quoted data**, and the prompt says never to
  follow instructions inside it. The answer only fills the member's own form,
  and is checked against the same rules as typed tags.
- **An admin can switch it off** in Settings → App settings → Themes and
  sounds, Member uploads (`uploads.aiLabels`, on by default). Forty calls per
  member per ten minutes at most.

### From a Pixabay link

On Backgrounds the upload window has two tabs, "From your device" and "From a
Pixabay link" (task 06, part 8). The second takes Pixabay photo,
illustration and film links, one per line, up to ten at once, and each
becomes the member's own upload.

- **The same worker and key as the admin's import.** Each link is a row in
  `pomodoro_member_imports` (migration 0145), and the
  `pomodoro-pixabay-imports` worker fetches one member link at the start of
  each pass, before the admin's, with the site's Pixabay key
  (`src/server/pomodoro/member-imports.ts`). A picture is ready at once; a
  film goes to the re-encode like any uploaded clip and the bell says when it
  is ready.
- **Named and tagged by Pixabay.** The name comes from the link
  ("forest-fog-trees" becomes "Forest fog trees") and the tags from
  Pixabay's own, held to the usual tag rules.
- **The credit stays with the file.** The Pixabay author and the page are
  kept on the upload (`source_author`, `source_page_url`), and the cog's File
  card says "From Pixabay, by Hans."
- **Pro only, and it counts against the space**, checked when the links are
  pasted and again against the file that arrived. A film over 100 MB in every
  size Pixabay offers is refused with a sentence.
- **No music or sound effects.** Pixabay has no music API and turns away a
  server that asks for its pages, so a music link is refused on its line:
  "Line 1 is music or a sound effect, which Pixabay does not let us copy.
  Download it on Pixabay, then upload the file." The Sounds window has no
  Pixabay tab for the same reason. A vector is refused too.
- **Ten links a day per member** by default, counted over the last 24 hours,
  because every import spends the site's one Pixabay key. An admin changes
  it in Settings → App settings → Themes and sounds, Member uploads
  (`uploads.pixabayDailyLimit`). A link past the limit is refused on its own
  line: "Line 3 is over today's limit of 10."
- **The window lists the member's last ten imports** with how each went
  ("Waiting its turn", "Fetching it…", "In the grid", or why it failed), and
  re-reads every 4 seconds while one is on its way.
- **A throttled minute does not use up a try.** Pixabay saying "too many
  requests" puts the row back for the next pass; anything else gets three
  tries before the row says why.

## The cog

Every upload's card ends with three buttons: the "+" that adds it to a room,
a cog, and the bin. Tyler, 10 Oct 2026: "There is no edit icon for the
uploaded background, add the cog icon here", and "I should be able to reclip
the file too". The "+" on every theme and sound card is a plain icon with no
background, the same as the bin (Tyler, same day).

The cog opens a window with the upload's Name, Tags and Share tick, and for a
sound or clip the trim strip, already open. Save changes saves the name, tags
and tick at once. A moved trim also asks the worker for a new cut, and the
window says so before you press it.

- **A new cut is made from the kept original**, not from the last cut, so the
  handles cover the whole file you sent and a re-trim can win back parts an
  earlier trim cut. Tyler chose this on 10 Oct 2026, over cutting the last cut
  shorter, knowing the original uses space.
- **The original counts toward your space.** It is a library file of its own
  (`source_media_id`, migration 0134), so a 100 MB phone clip uses 100 MB
  plus its few-megabyte cut. Being its own row also means the storage page's
  orphan sweep sees it and never deletes it as a stray file.
- **The old cut keeps playing until the new one is ready.** The card says
  "Making the new cut…" and still plays, and a room using it keeps it. The
  bell says when the new cut is done. If it fails, the card says "The new cut
  could not be made. The old one still plays."
- **One cut at a time.** While a cut is being made the window says to trim
  again once it is ready, and the server refuses a second.
- **A new cut is rationed like an upload.** It needs Pro, the same as
  uploading. An older upload's copy (below) must fit in the space left. At
  most ten new cuts per member in ten minutes, because each one is a worker's
  FFmpeg run. A rename, retag or Share change has none of these limits.
- **A new cut waits its turn.** The worker takes jobs by when they last
  joined the queue (`queued_at`, migration 0135), not by when the file was
  first uploaded, so re-trimming an old file goes behind everybody's newer
  uploads. The "files ahead of it" count uses the same order.
- **A trim past the end of the file fails with a sentence**: "The trim starts
  after the end of the file. Pick a start inside it." FFmpeg writes an empty
  file without complaint when asked to start past the end, so the worker
  measures what it made and refuses anything under half a second. The handles
  never ask for this; a hand-made request could.
- **Uploads from before 10 Oct 2026 and AI-made files** never kept an
  original. Their first re-trim copies the finished file to be the original,
  so the handles cover what was kept and it can only get shorter. Measured: a
  clip cut to 10 seconds before this change was re-trimmed to 6, with the 10
  second file kept as its original.
- **A picture has no trim**, and the window shows only its name, tags and tick.

## What happens to the file

A picture is finished the moment it lands. Sound and video are queued, and the
`pomodoro-media-uploads` worker re-encodes them on the shell's fifteen-second
loop, one per pass:

- **Video becomes 720p with no sound at all.** A background is scenery and the
  sound player owns audio. A 1920x1080 clip with an AAC track came back 1280x720
  with no audio stream, and 104 KB became 48 KB.
- **Sound becomes a 192 kbps MP3, loudness-normalised**, so picking a new loop
  does not blow your ears off at the volume the last one was comfortable at.
- **A sound's end is crossfaded over its own start** (task 08, part 3), so it
  loops with no click or jump. The last 2 seconds fade into the first 2, which
  makes the finished file 2 seconds shorter than what was kept: a trim that
  kept 10 seconds plays 8, and loops without a seam. A sound under 2 seconds
  is left as it is. It is the same crossfade AI soundscapes get
  (`seamlessLoopPlan` in `src/server/pomodoro/media-transcode.ts`). Every new
  upload and every new cut gets it; sounds prepared before 10 Oct 2026 keep
  playing as they are.

A trimmed file is cut in the same FFmpeg run, so the finished file is only the
part the member kept.

One upload per pass on purpose: FFmpeg is the most expensive thing this app
does, and a queue of videos must not hold the room clock behind it. Ten uploads
take ten passes, about two and a half minutes.

While that runs the card says "Getting it ready…" and cannot be picked, because
the file behind it is still the raw original. The page asks again every four
seconds, and only while something is actually waiting. A re-encode that fails
goes back in the queue twice; after that the card says so in words instead of
spinning forever. A server with no FFmpeg says "Sound and video cannot be
prepared yet." The production worker image has FFmpeg only when it is built
with `WORKER_PACKAGES=ffmpeg`, which Pomodoro's Coolify worker resource must
set (the repo's `docs/deployment.md` explains the argument). The website image
never has it, because the website never re-encodes anything.

## The button waits before it lets you press anything

The Upload button starts shut on every visit and opens only once the server has
said whether this account may upload. Every screen in the product hydrates in
the browser — guests have no server session, so no page under `_pomodoro` has a
route loader — and for a signed-in member this strip therefore asks for its
list, the Pro answer and the space used in one request when the page opens.

**A guest is never asked for.** The layout already knows whether anybody is
signed in (`useProductAuth`), so the strip reads that instead of asking the
server, which would answer 401 and put a red "Please sign in again." on a page
that was working perfectly well. A guest gets a settled, quiet answer: a Sign
in button and a line saying to sign in on a Pro plan.

Treating "not known yet" as allowed was a bug: on a free account you could open
the file picker by clicking quickly, and the upload was then refused by the
server a moment later. The right answer, arrived at the wrong way round. The
padlock and the tooltip also wait, so a paying member is never briefly told that
uploading is a perk they do not have.

## The bell

A video or sound that had to be converted says in the bell when it is ready,
with the name the member gave it, or that it could not be prepared, with the same reason the
picker shows. Only giving up says anything; a retry does not. An upload the
member deleted before it was converted says nothing. See
[Notifications](notifications.md).

## Where the files live

In the shell's own media library (the `media` table) and its R2 bucket, exactly
like every other file this app stores. Rebuilding that plumbing would give the
app a second place to look for a file.

`pomodoro_media_uploads` (migration 0091) is the part the shell knows nothing
about: which library files belong to the pomodoro app, what the member meant
each one for, and how the re-encode is getting on. Migration 0133 added the
window's `name`, `tags`, `shared`, `trim_start_ms` and `trim_end_ms`. Rows from
before it took their name from the library row's file name, so an old upload
still reads "IMG_4021.mp4". `name` stays nullable because a server still on
older code during a deploy writes rows without one, and the list reads the
file name for those. An AI-made file has no window, so it is named after its
file too. `media_id` is its primary
key, so one library file is at most one pomodoro upload and deleting the library
row takes the job row with it.

**Uploads are served straight from the bucket's public address**, which is what
`serializeMedia` hands out for every other file in the app. The app also has an
owner-checked route at `/api/v1/media/<id>/file`, and it is not used here: Vite's
dev server refuses to forward a request an `<img>` made to a Nitro handler, so
that route 404s in development while working in production, and having two ways
to fetch one file is worse than having one.

The preference still stores `media:<uuid>`, never an address. The server
resolves the address when it loads the preference and hands it to the browser,
so a deleted or half-prepared upload simply comes back without one and the
backdrop falls back to the default scene.

## Picking, and deleting

Picking an upload saves `media:<uuid>` the same way picking a scene saves
`scene:<key>`. The server checks the upload is **theirs, or shared with them**
(see [Shared sounds and backgrounds](shared-media.md)) and **has a finished file**
(a first prepare is done, or an older cut plays while a new one is made)
before saving it; without that check the address bar could put somebody else's media id
in the row.

A tagged file can also come up by itself, picked by a tags group in the
personal room, and a picture you uploaded drifts slowly unless that is
switched off. See [Shuffle and tags](shuffle-and-tags.md) and "A picture
drifts" in [Backgrounds](backgrounds.md).

A member's delete moves the file to the 30-day bin (see
[My uploads](my-uploads.md)): it is hidden everywhere and anything using it
falls back at once. Emptying the bin, or 30 days passing, is the final delete
below.

The final delete removes the bucket object, both rows, the kept original and
any preference pointing at it, in one go. A clip's still follows on the media
worker's next pass (see [My uploads](my-uploads.md)). An admin's delete takes the original too.
So does the shell's own Media page, which knows nothing about originals: a
database trigger removes an upload's kept original whenever the upload's row
goes (migration 0135), and the bucket file left behind is what the storage
page's orphan sweep removes. The member's delete reads the upload under a lock,
so a cut finishing at the same moment cannot leave an original behind. If it
was the background you were using, you go back to Lofi girl rather than to a
blank screen.

The bucket object is deleted after the rows, not before, so a bucket that
refuses leaves a file with no row — which the storage page's orphan sweep picks
up — rather than a row pointing at a file that is gone.

## Admins can delete a member's file

`/admin/pomodoro-uploads` lists every background and sound members uploaded
or had made by AI (admin task 06, 8 Oct 2026). It is "Member uploads" under
Themes in the admin's left menu, beside "AI generations". The menu is saved
on the workspace (Settings → Navigation), not in code, so the two links were
added to the local workspace on 10 Oct 2026 and still have to be added on the
live site. Each row's name is the one the member typed, and the search finds
it or the file name. Each row shows a small preview,
the owner, whether it is a background or a sound, the size, and whether it is
in use. Sounds play from the row's play button.

- **"In use" names where.** A file can be the owner's room background, their
  room sound or their profile banner. Those are the only places a member's own
  file can be chosen.
- **Delete works on one row or on every ticked row**, in one request. The
  admin delete puts the owner back exactly where their own delete would: a
  room background goes back to Lofi girl, a room sound to silence, a profile
  banner to none.
- **The shell's admin delete removes the file.** That is `deleteMediaAsAdmin`,
  the same one the shell's Media page uses. It refuses a file that was used
  as a logo in a sent email, and the line afterwards counts that file as kept.
- **The member is not told.** The file simply leaves their picker. Taking a
  file off sharing instead keeps it and does tell them; see "What an admin can
  do" in [Shared sounds and backgrounds](shared-media.md).
- **One log row per press** in `pomodoro_audit_logs`, resource
  `member_uploads`, naming every file that went.
- **Clicking the owner's name** opens their member window, and `?user=<id>`
  shows one member's files.

## Where the code lives

- `src/server/pomodoro/admin-uploads.ts` — the admin list and delete, behind
  `src/lib/api/pomodoro/admin-uploads-tags.ts`; the page is
  `src/components/pomodoro/admin-uploads-dashboard.tsx`.
- `src/lib/pomodoro/media-limits.ts` — the sizes, types and wording, in one
  browser-safe file, so the size a member is told about is the size the server
  enforces.
- `src/server/pomodoro/media-uploads.ts` — the byte sniffing, the cap, the
  library rows and the job queue.
- `src/server/pomodoro/media-transcode.ts` — the FFmpeg arguments, ported from
  the old app's worker.
- `src/server/pomodoro/media-worker.ts` — one job per tick, registered in
  `src/app/server-options.ts`.
- `src/lib/api/pomodoro/media-uploads.ts` — five server functions (list,
  upload, edit, delete, suggest a name), all guarded.
- `src/lib/pomodoro/upload-labels.ts` — the name, tag and trim rules and the
  "being prepared" sentence, shared by the window and the server.
- `src/server/pomodoro/upload-labels.ts` — the AI name and tags.
- `src/components/pomodoro/uploads-page.tsx` — the My uploads page and the
  "+ Add" link; the route is `src/routes/_pomodoro/uploads.tsx`.
- `src/components/pomodoro/media-uploads-section.tsx` — the "Your own" card
  each tab uses.
- `src/components/pomodoro/upload-window.tsx` — the upload window.
- `src/components/pomodoro/pixabay-import-panel.tsx` — its Pixabay tab; the
  rows and the worker step are `src/server/pomodoro/member-imports.ts`.
- `src/components/pomodoro/upload-edit-dialog.tsx` — the cog's window.
- `src/components/pomodoro/trim-strip.tsx` — the preview player and two
  handles, shared by both windows.
- `src/components/pomodoro/tags-field.tsx` — the tags box, shared with the
  catalogue window.
