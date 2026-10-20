# Followed creators, the watch timer and saving videos

The Creators page is gone: following creators now happens inside a Viral
project, and how that screen works is in `viral-projects.md`. This file is
what sits underneath it: following somebody, the timer that checks them for
new videos, what Download and AI analyse download, spend and write down, and
what deleting a saved video removes.

## Following somebody

A creator is followed from a Viral project's Creators tab, either by pressing
Follow on a channel the search found or by pasting the link to a profile: a
YouTube channel, a TikTok profile or an Instagram profile. A link to one of
their videos is refused with a sentence saying so, and so is a link to any
other site.

- The handle is stored lowercased, so @Alice and @alice are one creator rather
  than two.
- A YouTube link spends one unit of the day's YouTube allowance, to turn the
  handle into the channel id that listing uploads needs.
- Their picture is fetched once and served by the app, not by the platform.
  Platform addresses expire, and asking for one tells the platform who is
  looking at whom.
- A creator is stored once per person and linked to each project they are in.
  Unfollowing in the last of those projects unfollows them for good.

## The watch timer

Off unless `VIDEO_WATCH_ENABLED=1` is set, so a developer's machine never
quietly starts scraping. When it is on, it looks at each watched creator every
six hours and reads their ten newest uploads.

**It only ever writes things down.** It never downloads a file and never calls
AI. Those cost money and disk, and they happen only when somebody presses the
button.

- **TikTok** goes through yt-dlp's flat playlist. This is the one that works
  with nothing set up: checked 2 Oct 2026 against a real profile, it came back
  with five videos and their view counts.
- **YouTube** goes through the Data API: about 2 units per creator per check.
  Thirty creators checked four times a day is roughly 240 of the 10,000 free
  daily units, next to the 102 one keyword search costs. **It needs the key in
  Settings → YouTube.** With no key saved, YouTube creators are skipped and a
  line is written to the server log.
- **Instagram cannot be watched at all any more**, and it is not this app's
  doing. Measured on 2 Oct 2026, three ways:
  - Instagram's own profile endpoint answers **HTTP 401** to every handle
    tried, including `@instagram` itself. The old ai-video app's byte-for-byte
    code gets the same 401, so this is not a port that went wrong — the
    endpoint closed after that app was written.
  - yt-dlp cannot list a profile either, on 2026.06.09 or on the current
    2026.08.19.
  - yt-dlp's source says why: `InstagramUserIE` carries `_WORKING = False`.
    Listing somebody's posts is marked broken upstream.

  So an Instagram creator can be followed, but never gets any videos, and each
  check logs the refusal. Getting past it needs a logged-in Instagram session,
  which is a decision about storing a login rather than a bug to fix. **Follow
  TikTok and YouTube creators instead.**

  One Instagram video by its own link is a different matter: `InstagramIE` is
  not marked broken, so Download or AI analyse on a pasted reel link should still
  work. That one has not been measured.

## Covers

TikTok and Instagram hand out cover addresses that stop working after a set
date: one saved on 2 Oct 2026 stopped on 15 Oct, and its card went blank. So
the app keeps its own copy of each cover picture (`video_creator_posts.
thumbnail_storage_path`, migration 0116), and every card and favourites
collection shows that copy when there is one.

- **No video is downloaded and no AI runs.** The `video-creator-covers`
  worker takes five posts a pass. It fetches the picture from the address
  already saved. If that address has expired, it asks yt-dlp for the post's
  cover address as the page gives it today, with `--skip-download`. Measured
  17 Oct 2026: 2 seconds and one 151 KB picture.
- **It runs whether or not the watch timer is on**, because it only touches
  posts already saved. On the local database it kept all 10 of Zach King's
  covers in under a minute.
- **A cover it cannot get is tried again a day later**, not on every pass.
- **YouTube covers never expire**, so YouTube posts are left alone.

A video the timer already saved has its view and like counts updated rather than
being added again, so numbers stay current without the list piling up copies.

Each person gets at most **one notice per check**, however many creators
posted: "4 new videos from 2 creators you follow", with "Open their project in
Viral to watch them." It goes to the notification tray as an app activity
notice, which each person can switch off in Settings → Notifications. A video
you have already been told about never produces a second notice.

A YouTube check counts its 2 units in the app's own tally of the day's
allowance (`viral-projects.md`), so a busy watch timer leaves less room for
searches and the allowance check says so.

Five creators are checked per tick, so thirty creators spread their platform
requests out instead of firing all at once and being rate-limited for it.

## Pausing one creator

Each followed creator's row in a Viral project's Creators list has a **Check
for new posts** switch and a line saying when the timer last looked, such as
"Last checked 2 hours ago", or "Not checked yet". The switch writes
`video_creators.watch`, which the timer already skipped on.

- **Pausing pauses everywhere.** A creator is stored once per person and
  linked to every project they are in, so the switch is the creator's, not the
  project's. The hint beside the switch says so. A paused row's chip reads
  Paused instead of Following.
- **Nothing saved goes.** A paused creator keeps every post already saved, and
  their videos stay on the grid.
- **Switching back on** puts them in the next pass after the six hours since
  their last check have run out. A creator paused for longer than that is
  checked on the very next pass.
- **Only followed creators have it.** A channel that only turned up in search
  results is never checked by the timer, so its row has neither the switch nor
  the line.
- **Only the owner can flip it.** The server looks the creator up by the
  caller's own id, so somebody else's creator is refused as not found.

## Download and AI analyse

Under the player there are two buttons, and the line above them says which
one spends AI money. Tyler asked for the split on 18 Oct 2026: "Have 2 button
to download the video and another button to Ai anaylize it".

- **Download** keeps the video in the media library and spends no AI. It costs
  storage only, up to `VIDEO_MAX_DOWNLOAD_BYTES` (100MB by default, which is
  also the media library's own ceiling).
- **AI analyse** has Gemini break the video down, and downloads it first when
  it is not downloaded yet. It is the only one of the two that spends from the
  monthly AI allowance, and pressed in a Viral project it counts against that
  project's spend limit.

Ticking videos in a Viral project offers both for all of them in one request.

Pressing either writes a row and returns straight away. A background worker
then:

1. Downloads the video with yt-dlp, capped at the 100MB above.
2. Puts the file in the media library.
3. Takes a cover frame with ffmpeg.
4. Stops there, at `downloaded`, if the row was saved with Download alone.
5. Otherwise hands the file to Gemini, which writes out everything said,
   splits the video into its parts (hook, problem, twist of the knife,
   solution, proof, the ask) and marks every scene cut.

**AI analyse on a downloaded video never downloads it again.** The row goes
back in the queue, and the worker sees the file is already in the library and
hands Gemini that stored copy. The same goes for Try again on a breakdown that
failed after its download had landed. AI analyse pressed while a Download is
still running is not lost either: the worker reads the row's
`wants_analysis` in the same statement that records the finished download.

**Closing the browser does not stop it.** A row left half-done by a restart is
put back in the queue on the next tick, because its claim has expired.

Pressing a button twice is one row, never two. Saving the same video from two
projects is also one row: it is keyed on who you are, which platform it is on
and the platform's own id for the video. AI analyse on a row saved with
Download alone turns the AI on for that same row, and the project it was
pressed in becomes the one whose spend limit the breakdown counts against.

A row's status runs waiting, downloading, then either `downloaded` (Download)
or analysing and `ready` (AI analyse). `failed` keeps its reason. Migration
0121 added `downloaded` to the table's allowed statuses and the
`wants_analysis` column. Every row saved before then was saved with Save &
break down, so the column starts true for all of them.

### What you get back

The right panel shows the parts with their time ranges and a line on what each
one does, then the cuts, then every word. **Clicking any of them jumps the
player there.** That display is one component, used under the player on a
Viral project and in the editor's Copy panel.

### Copy this

Above the two buttons sits **Copy this**. It saves and breaks the video down
the way AI analyse does, makes a new project that copies it, and opens that
project in the editor on its Copy panel (see `project-first.md` and
`viral-projects.md`). It works before or after the video is saved; a video
already downloaded is not downloaded again.

### When it fails

The row keeps the reason and offers Try again. yt-dlp's own last error is kept
where there is one, so "this post is private" reaches the screen rather than
"download failed". A row is never left half-saved with no status.

If yt-dlp or ffmpeg is not installed, the error names the missing program.

The breakdown asks `gemini-3.8-flash`. When Google answers that the model is
"experiencing high demand", the breakdown waits 5 seconds and then 20 before
giving up, and then says "Google is turning requests away right now — wait a
minute and try again" rather than an error number. On 17 Oct 2026 two asks
in three got that answer.

## Deleting a saved video

A saved video is deleted from the trash button in the action row under its
player, or from the bulk bar on the Downloaded and Broken down tabs. The window
says what will happen before anything goes, counted from the database when
it opens.

- **What goes:** the row, which holds the breakdown, then the cover, then the
  downloaded file in the media library.
- **When the file stays:** when an editor project has dragged the file onto
  its timeline. The window names those projects and says the file stays in the
  media library because of them. The file also stays when anything else in
  Video still uses it, such as a carousel or a media collection
  (`mediaStillInUse` in `src/server/video/media-in-use.ts`), and the message
  after the delete says how many files stayed.
- **Projects made with Copy this:** the window lists them, and they stay. Their
  key to the video blanks itself when the row goes, so just before the delete
  the app writes the video's title onto each of them
  (`video_projects.source_viral_video_title`, migration 0121). Their Copy panel
  then says "The original video, <title>, was deleted". A video that never got
  a title is named by its link.
- **Favourites:** a starred video keeps its own copy of its details, so it
  keeps showing in every collection. It just stops being marked as saved.
- **Somebody else's:** an id that is not yours finds nothing, and nothing of
  theirs is touched.
- **Downloading it again later** makes a new row, as if it had never been
  saved.

## What else deleting keeps

- **Unfollowing a creator for good** (in the last project they are in)
  removes them and every post of theirs the timer saved. **Any video you
  already saved and broke down stays**, with its file and its breakdown. A
  saved video belongs to whoever saved it, not to whoever they happened to be
  following, which is why the archive holds the channel as plain text rather
  than pointing at the creator.
- **Deleting a Viral project** keeps every creator still followed in another
  project, and every saved breakdown.

## Where the "Saved" chip comes from

Nothing stores whether a video has been broken down. The project screen joins
the saved-videos table on the three columns that make a video one row: owner,
platform and the platform's video id. A video saved from one project therefore
shows as saved in every project, with nothing to keep in step.

## Deployment

- `VIDEO_WATCH_ENABLED=1` switches the watch timer on. It is off everywhere
  else.
- `VIDEO_MAX_DOWNLOAD_BYTES` overrides the 100MB download cap.
- Migration 0121 must run on the live database before this version serves
  pages: the app writes the `downloaded` status and reads `wants_analysis`
  and `source_viral_video_title`.
- **yt-dlp must be installed on the host**, built with `curl_cffi` so that
  `--impersonate` works. Without it, saving a video fails with a message naming
  yt-dlp. ffmpeg must be there too, as it already is for exports. Both are on
  the development machine (yt-dlp 2026.06.09, via Homebrew); whether they are
  on the Hetzner server is still unanswered.
- The YouTube key is the one in Settings → YouTube (`viral-search.md`).
