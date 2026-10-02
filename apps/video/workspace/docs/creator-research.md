# The creator research dashboard

`/admin/video-creators` is one screen for studying other people's videos: the
creators you follow on the left, every video they have posted in the middle,
and the one you picked playing on the right with an AI breakdown beside it.

It is admin-only, the same as the Viral page, because the watch timer spends
YouTube's daily allowance and each breakdown spends AI credits.

## The three panels

The layout is the editor's: three resizable panels, dividers you can drag, and
sizes that come back next time. Double-clicking the empty part of a side panel
shuts it, and a tab on the middle panel's edge opens it again. Below the wide
breakpoint the same three stack in the same order.

- **Left — creators.** An "Everyone" row, then your folders, then an "In no
  folder" group. Each creator row shows their picture, name, follower count,
  how many views a day their recent videos are getting, and their watch switch.
- **Middle — what they posted.** Every video from the creators in scope, newest
  first, 50 at a time. Clicking a folder or a creator on the left narrows this
  list; clicking the same one again widens it back out.
- **Right — the video.** Plays whatever is picked, with the breakdown under it
  once there is one.

Picking a creator turns the middle panel's own header into theirs: a back arrow
out to everyone, their picture and handle, their follower count, the watch
switch, a link to their profile and an unfollow button. That header is the
creator's detail view, and there is no separate page for one creator. It is the
card header itself rather than a second row under it, so the panel never has
two header bars stacked up.

## Following somebody

Paste the link to their profile: a YouTube channel, a TikTok profile or an
Instagram profile. A link to one of their videos is refused with a line saying
so, and so is a link to any other site.

- The handle is stored lowercased, so @Alice and @alice are one creator rather
  than two.
- A YouTube link spends one unit of the day's YouTube allowance, to turn the
  handle into the channel id that listing uploads needs. With no key saved, the
  window says so and only TikTok and Instagram work.
- Their picture is fetched once and served by the app, not by the platform.
  Platform addresses expire, and asking for one tells the platform who is
  looking at whom.

## Folders

A creator can sit in several folders at once, which is why the folder button on
their row opens a list of checkboxes rather than a single choice. Somebody can
be both a competitor and worth studying for hooks.

- The cog in the panel header opens the manage window: drag folders into order,
  rename one, hide one from the panel with the eye, or delete it.
- **Deleting a folder keeps its creators.** Only the grouping goes, and the
  confirmation says so.
- Names are unique per person, ignoring case, and 100 folders is the limit.

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
  not marked broken, so Save & break down on a pasted reel link should still
  work. That one has not been measured.

A video already on the feed has its view and like counts updated rather than
being added again, so numbers stay current without the list piling up copies.

Each person gets at most **one notice per check**, however many creators
posted: "4 new videos from 2 creators you follow". It goes to the notification
tray as an app activity notice, which each person can switch off in
Settings → Notifications. A video you have already been told about never
produces a second notice.

Five creators are checked per tick, so thirty creators spread their platform
requests out instead of firing all at once and being rate-limited for it.

## Watching a video

**Clicking a video in the feed costs nothing.** No download, no AI call.

- A **YouTube** video plays in YouTube's own embed, through the no-cookie
  domain so looking at research does not get the viewer tracked.
- **TikTok** and **Instagram** show the video's cover and a button out to their
  own site. Their embeds need third-party scripts that are not worth loading to
  watch one clip.

## Save & break down

The button under the player is the only thing that spends anything. It says so
above itself: the download and the AI call spend from your monthly AI allowance
and up to 100MB of storage.

Pressing it writes a row and returns straight away. A background worker then:

1. Downloads the video with yt-dlp, capped at `VIDEO_MAX_DOWNLOAD_BYTES`
   (100MB by default, which is also the media library's own ceiling).
2. Puts the file in the media library.
3. Takes a cover frame with ffmpeg.
4. Hands the file to Gemini, which writes out everything said, splits the video
   into its parts (hook, problem, twist of the knife, solution, proof, the ask)
   and marks every scene cut.

**Closing the browser does not stop it.** A row left half-done by a restart is
put back in the queue on the next tick, because its claim has expired.

Pressing the button twice is one row, never two. Saving the same video from the
Viral page and from here is also one row: both are keyed on who you are, which
platform it is on and the platform's own id for the video.

### What you get back

The right panel shows the parts with their time ranges and a line on what each
one does, then the cuts, then every word. **Clicking any of them jumps the
player there.** That display is one component, used both here and in the Viral
page's detail window.

### When it fails

The row keeps the reason and offers Try again. yt-dlp's own last error is kept
where there is one, so "this post is private" reaches the screen rather than
"download failed". A row is never left half-saved with no status.

If yt-dlp or ffmpeg is not installed, the error names the missing program.

## What deleting keeps

- **Unfollowing a creator** removes them, their folder memberships and every
  feed row of theirs. **Any video you already saved and broke down stays**,
  with its file and its breakdown. The confirmation says this before you press
  it. A saved video belongs to whoever saved it, not to whoever they happened
  to be following, which is why the archive holds the channel as plain text
  rather than pointing at the creator.
- **Deleting a folder** keeps the creators in it.

There is no way to throw a saved video away yet. Everything saved stays until
somebody adds one.

## Where the "Saved" chip comes from

Nothing stores whether a feed video has been broken down. The feed joins the
saved-videos table on the three columns both tables are unique on: owner,
platform and the platform's video id. A video saved from the Viral page
therefore shows as saved on the dashboard too, with nothing to keep in step and
nothing to get out of step.

## Deployment

- `VIDEO_WATCH_ENABLED=1` switches the watch timer on. It is off everywhere
  else.
- `VIDEO_MAX_DOWNLOAD_BYTES` overrides the 100MB download cap.
- **yt-dlp must be installed on the host**, built with `curl_cffi` so that
  `--impersonate` works. Without it, saving a video fails with a message naming
  yt-dlp. ffmpeg must be there too, as it already is for exports. Both are on
  the development machine (yt-dlp 2026.06.09, via Homebrew); whether they are
  on the Hetzner server is still unanswered.
- The YouTube key is the one in Settings → YouTube, shared with the Viral page.
