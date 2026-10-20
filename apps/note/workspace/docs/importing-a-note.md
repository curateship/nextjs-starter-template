# Importing a note

The Import dropdown in a library's middle header brings in a YouTube, Instagram,
TikTok, X, Threads, LinkedIn, Facebook or Reddit link as a note. The click only writes the note and returns; the slow
part happens in the `note-imports` worker, so closing the browser never stops
an import.

## Tyler's rules, 20 Oct 2026

- The Import menu has YouTube long, YouTube short, Instagram, TikTok and
  X/Twitter, as his picture draws it. Uploading a video file was dropped.
  ("Drop it")
- An import files its note in a folder named after its source, made the first
  time. ("Import files it there")
- An imported video is downloaded and kept: 720p, up to 30 minutes and 500MB.
  It plays in the app even if the post is deleted later. ("Download and keep
  it")
- An X import keeps the full post: the long text, the whole thread, the quoted
  post, the pictures and the video, read from X's own post page. Highlights and
  the Save from x.com button stay.
- Importing never spends AI money. ("Only on the button")
- Threads, LinkedIn, Facebook and Reddit join the menu, after his five.
  LinkedIn, Facebook and Reddit are videos only. yt-dlp has no reader for
  Threads, so Threads has a page reader of its own, as X does. ("build page
  reader for threads too")
- Saving from his iPhone is an Apple Shortcut. ("iPhone")
- The author is read from the link, and can be edited. ("Read from link but I
  can edit it")

## Defaults Tyler was offered and did not change

- A link from another source than the one picked (a TikTok link pasted under
  Instagram) is filed under its real source, and the toast says so.
- The same link imported twice into one library opens the note already there.
  The same link may sit in two libraries.
- The bin on the Video card removes the link, the file, the author and the AI
  cards. The note and its own text stay, as a plain "Note".
- X's "Bring in the article" was dropped.
- One person may import sixty links in ten minutes.

## Which links work

`src/server/note/library/import-links.ts`, with its tests beside it, on top of
`src/server/note/links.ts` and `src/lib/note/library/x-links.ts`.

- **YouTube long**: `youtube.com/watch?v=` and `youtu.be` links.
- **YouTube short**: `youtube.com/shorts/` links.
- **Instagram**: `/reel/`, `/reels/`, `/p/` and `/tv/` links.
- **TikTok**: `tiktok.com/@name/video/<id>`, and the shortened `vm.`, `vt.` and
  `/t/` links, which only say which video they are once followed.
- **X/Twitter**: `x.com` and `twitter.com` `/<handle>/status/<id>` and
  `/i/status/<id>`, with or without `?s=` on the end.
- **LinkedIn**: `linkedin.com/posts/…-activity-<id>-…` and
  `/feed/update/urn:li:activity:<id>`. A profile or a page is refused.
- **Facebook**: `/watch?v=<id>`, `/reel/<id>`, `/<page>/videos/<id>`, and the
  share links `/share/v/…`, `/share/r/…` and `fb.watch/…`, which only say which
  video they are once followed.
- **Reddit**: `/r/<community>/comments/<id>/…` on `www.`, `old.`, `new.` or
  `m.reddit.com`, `redd.it/<id>`, and the share link `/r/<community>/s/…`.
- **Threads**: `threads.com/@<handle>/post/<code>` and the older `threads.net`
  address, kept as the one `https://www.threads.com/…` address, so a post is
  one note whichever way it was pasted. A profile is refused.
- **LinkedIn, Facebook and Reddit are saved as videos**, the way YouTube and
  TikTok are: yt-dlp downloads the post's video. A post with no video fails
  with yt-dlp's own sentence. The post's words are not read, as X's are.
- **Anything else** is refused: "That link isn't from YouTube, Instagram,
  TikTok, X, LinkedIn, Facebook or Reddit."
- **A link already in the library** opens that note. One in Trash is brought
  back out, and the toast says so.

## What happens

1. **The note appears at once**, titled "Importing…", in the source's folder.
   The folder is found by the source it was made for, so one renamed by hand is
   still used; a folder of the same name made by hand is taken over; a deleted
   one is made again.
2. **The worker claims it** on the shell's 15-second loop.
3. **A video link**: yt-dlp downloads the file, it goes up to the bucket ten
   megabytes at a time, ffmpeg takes a cover, and the note gets the video's
   title (unless one was typed meanwhile), the channel as its author, the length
   and the date. The bell says "Ready to analyse".
4. **An X link**: the worker reads X's signed-out post page
   (`src/server/note/library/x-page.ts`), copies up to 24 pictures to the bucket
   at `note-imports/<owner>/<note>/`, and saves the words, the thread up to 60
   posts, the quoted post and the like and repost counts. The note's title is
   the post's first line. A post with a video then downloads it the same way
   while the words are already there to read.
4. **A Threads link**: the worker reads the post's page
   (`src/server/note/library/threads-reader.ts`) the way a link preview does,
   as Facebook's preview fetcher, since a Threads page fetched as a browser is
   an empty shell filled in by a script. That page carries the author's name
   and handle and the post's words in full, which the note keeps, titled with
   the first line, in a Post card like an X post's. A signed-out reader gets
   nothing else: no pictures (the one preview picture is a card Threads draws
   of the words, so it is not kept), no video, no replies, no likes and no
   date. A private or deleted post gets Threads' log-in page instead, and the
   card says "Threads didn't show this post. It may be private or deleted, or
   Threads changed its page." Read on 20 Oct 2026 from a Mac against two real
   posts; whether Threads answers the live server the same way is not yet
   checked.
5. **A shortened TikTok link that turns out to be a video already in the
   library** stops with "That link is already in this library", and nothing
   typed is lost.

## The worker

`src/server/note/library/jobs.ts`, registered in `src/app/server-options.ts` as
`note-imports`. It replaced the `note-videos`, `note-notes` and `note-posts`
workers.

- One job at a time, claimed in this order: anything whose worker went away is
  put back, then one note queued for the AI, else one link waiting to import,
  else one X post's video waiting to download.
- The tick starts the job and does not wait for it, because the shell's pass
  waits for every worker and a download can take fifteen minutes.
- A claim is a 20-minute lease, pushed forward between steps. Every write checks
  the lease is still this worker's; one that finds the note deleted, or its
  import removed, throws its work away and removes what it had stored.
- Each tick also deletes for good a batch of notes that have been in Trash over
  30 days, with their saved files. One whose file will not delete is logged
  and passed over, so it never holds up the rest.
- An author typed while the note imported stays; the worker fills the author
  only when the note has none. Every author name is stored with its spaces
  tidied, so the Authors card can match on it.
- Pictures from X are fetched with no redirects, and one with no size, or a
  wrong one, is never read past 8MB.

## Failures and Try again

- A failed import keeps its reason on the Video or Post card, and yt-dlp's or
  X's own sentence reaches it ("This post is private"). Anything else, such as
  a database error, stays in the server log and the card says "Something went
  wrong on the server. Try again."
- Try again imports the link again from the start. It counts against the same
  sixty-in-ten-minutes allowance as an import, and so does "Try the video again".
- An X post whose video failed keeps its words and offers "Try the video again".
- Each failure rings the bell once, with the reason under it.

## Save to Note

A bookmark button, dragged once to the browser's bookmarks bar from Settings →
App settings → Library (`src/components/note-library/save-to-note.tsx`). It was
"Save from x.com" until 20 Oct 2026; a button dragged before keeps working,
since its key is the same. Clicked on a YouTube, Instagram, TikTok, X,
LinkedIn, Facebook or Reddit page it opens `/library?key=<key>&save=<link>` in
a new tab, which imports the link into its own source's folder of the library
opened last (or a new "My library") and opens it there (`saveFromLink` in
`src/server/note/library/imports.ts`).

## Save from your iPhone

An iPhone does not let a website appear in its Share menu, so an Apple Shortcut
does it. The "Save from your iPhone" card under Save to Note lists the steps
and the person's own address with a Copy button: a Shortcut shown in the Share
Sheet that takes URLs, URL-encodes the shared link, puts it after the address,
and opens the result. That is the same `/library?key=<key>&save=<link>` the
bookmark opens, so nothing on the server is new. The address holds the
person's key, which the card's label says to keep to themselves. An Android
Share menu entry would need a change to the shell's manifest and was not
asked for.

- **The key is the person's own** (`src/server/note/library/save-key.ts`): a
  code made from the server's secret and their account, built into their
  button. The page imports with no click, so without it another site could send
  a signed-in member there and import a post of its choosing. A missing or
  wrong key says "This Save to Note button is not yours, or is an old one.
  Drag it again from Settings → App settings → Library."
- **It needs `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY`**, the same secret saved AI
  keys use. Without it the button and the Shortcut say so instead of saving.

## What removing or deleting takes

The saved file and its media library row, the cover, the author's picture and
the post's pictures. A file a sent newsletter carries is kept, the shell's own
rule. The original stays on its site. Videos and posts saved before 20 Oct 2026
were deleted with their tables by migration 0102; their files stayed in the
media library, where they can be deleted by hand.

## What a deploy needs

- Migrations `0102_note_library.sql` (drops the old Videos, Notes and Posts
  tables and makes the library ones) and `0103_note_library_menu.sql` (the
  Library link) run on the way in. **0102 deletes every saved video, post and
  note**, as Tyler asked. `0104_note_pins_and_play_place.sql` adds the folder
  and row pins, the video's place and the three newer sources, and deletes
  nothing.
- `WORKER_PACKAGES="ffmpeg yt-dlp"` and `WORKER_PIP_PACKAGES="curl_cffi"` on
  the worker image, both build time. Alpine's yt-dlp comes without curl_cffi,
  and without it `--impersonate chrome` stops every download. `launch.md` has
  the rest of the live setup.
- A storage bucket saved in Settings → General.
- A Gemini key in Settings → AI for Analyse.
- **On the live server**, X serves the same post page as it does to a Mac: an
  X post imported on note.barelycompany.com on 20 Oct 2026. YouTube does not.
  It answers the server with its "Sign in to confirm you're not a bot" check,
  so YouTube imports fail on live. `launch.md` → "YouTube refuses the server".
