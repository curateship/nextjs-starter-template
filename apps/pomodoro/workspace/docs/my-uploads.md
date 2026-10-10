# My uploads

`/uploads` is the one place a member manages every sound and background they
uploaded or made with AI (uploads-and-sharing task 02, 10 Oct 2026). How a file
gets there, the upload window, trimming and the cog are in
[Your own backgrounds and sounds](own-media-uploads.md). This page covers what
the member can do with the files once they are there.

Tyler's choices, 10 Oct 2026: the page stays a grid of cards like Sounds and
Backgrounds rather than the table the task first drew; files in the bin still
count toward the member's space, with an Empty the bin button; and the cog's
window keeps its Save changes button rather than saving by itself.

## Three tabs

Backgrounds, Sounds and Bin, in the round pill style beside the title. The
address keeps the tab: `/uploads?kind=background`, `?kind=sound`, `?kind=bin`.
Reached from "My uploads" in the photo menu, the "+ Add" beside Shuffle on
Backgrounds and Sounds, and the bell. A guest who opens it sees the Sign in
card and nothing of anybody's.

## What a card shows

Each card is drawn like the catalogue's (see Your own backgrounds and
sounds). Under the name, one line says what is still happening ("Getting it
ready…", "Making the new cut…", or why it failed), or else carries the marks,
in the orange spaced capitals the catalogue's NEW uses:

- **AI**: made by the generator, not uploaded.
- **Shared**: the Share tick is on. What sharing shows to others is task 03.
- **In use**: it is the background or sound of the member's personal room,
  or their profile banner.

The marks sit on their own line, not beside the name, because a phone's
narrow card has no room for both. The "+" is placed from the picture's
height, so it stays level with the name whatever a card's neighbours make its
height.

### A clip shows a picture

A video's card shows the frame from the middle of the film and loads the film
only while the pointer is over it, so a grid of six clips loads six pictures,
not six films. The worker takes the frame right after it prepares the clip,
and again after every new cut. Clips from before stills existed catch up one
per pass, on passes with no other work. A film whose frame cannot be taken is
marked so the worker does not try it again, and its card keeps showing the
film's first frame as before.

Stills live in the bucket under `pomodoro-stills/<owner>/`, outside the
per-member folders the storage page's orphan sweep reads, because a still has
no library row of its own. They do not count toward the member's space; a
4K clip's still is about 170 KB.

**A still leaves the bucket however its clip goes.** Tyler, 10 Oct 2026:
"Clear the stills when an account is deleted." A database trigger notes the
still's path in `pomodoro_bucket_deletions` whenever an upload row is deleted,
or its still is replaced by a new cut's (migration 0137), and the media worker
removes every noted file on its next pass (`drainBucketDeletions` in
`src/server/pomodoro/bucket-cleanup.ts`). That covers the member's delete, the
admin's, the shell's Media page, and an account purge, whose upload rows go
with the account row: none of them has to know stills exist. A file the bucket
refuses stays noted and is tried again on the next pass.

A frame that cannot be taken from the film marks the clip, so the catch-up
pass moves on. A machine with no FFmpeg, or a bucket that did not answer,
marks nothing, and the clip is tried again on a later pass.

## Moving files to the bin

The bin icon on a card's corner moves that file to the bin. A tick box on the
picture's other corner, shown on hover, once any card is ticked, and always on
a phone, lets several go at once: "2 files ticked", Move to bin, Tick all,
Clear. Either way it is one request, and the line afterwards counts what moved
and what did not ("2 files moved to the bin.").

Nothing asks first, because nothing is lost: the toast has a Bring back
button, and the Bin tab keeps the file for 30 days. Bring back says how it
went ("1 file brought back."), and the toast goes when you switch tabs, so the
Bin tab is never left showing a file the toast already brought back. The bin
button waits while a move is on its way, so a double click moves it once.

A file in the bin:

- **is hidden everywhere** a member picks, plays, edits or is offered a file:
  the tabs, the room's player, the profile banner, the Add menu, the cog,
  the tag suggestions, the download and the worker's queue.
- **lets go of whatever used it.** A room using it falls back to the default
  scene or to silence, and a banner to none, at once, exactly as a final
  delete always did. Bringing it back does not put it back where it was.
- **still counts toward the member's space**, because its files are still in
  the bucket.
- **waits unprepared** if it was a sound or clip still in the worker's queue,
  and joins the queue where it left it when brought back.

## The bin

The Bin tab lists files of both kinds, most recently deleted first, each
greyed with "Goes for good on 9 Nov". The corner button brings one back; the
tick boxes bring back several. Empty the bin asks first ("Empty the bin? 3
files are removed for good, and the space they take comes back. This cannot be
undone.") and then removes every file in it through the final delete.
A file brought back while the bin is being emptied, or while the 30-day
clear-out runs, is kept: the final delete from the bin only takes a file that
is still in it.

A worker pass removes for good what has sat in the bin for 30 days, ten at a
time, on the media worker's fifteen-second loop.

**An admin's delete never comes here.** It is final, as before, and so is the
shell's own Media page.

## Space nearly full

When a member's space reaches 90% of their plan's limit (1.8 GB of 2 GB), the
bell says "Your space is nearly full." with the figures, and links to My
uploads. It is checked after every upload, every AI file and every final
delete or bin clear-out.

It says so once. A row in `pomodoro_storage_warnings` remembers it did, and
goes when the member drops back under 90%, so the next climb warns again. The
check never throws: a warning that cannot be worked out never undoes the
upload behind it.

## Download

The cog's window has a File card with a Download button, for a finished file
not in the bin. It sends the file the member plays, named after the file's
name ("Rain on my window.mp4"), and says what it is: "The prepared clip you
play: 720p, no sound." or "The prepared sound you play: a 192 kbps MP3." The
original the member sent is kept only for re-trimming and is not what
downloads.

The download goes through `/api/pomodoro/uploads/<id>/download`, which checks
the signed-in member owns the file, rather than the bucket's own address,
because a browser ignores a download's name on another site's file and opens
it instead. Anybody else's id, a file in the bin and one still being prepared
answer 404.

## AI files

A finished AI file is named after its prompt, cut to 80 characters at a word
break ("Soft rain on a cabin roof while a fire crackles and an old radio hums
somewhere"), and can be renamed, tagged and shared like any upload. Its card
carries the AI mark. Migration 0136 renamed the AI files made before this the
same way, leaving alone any a member had already renamed.

## Where the code lives

- `src/components/pomodoro/uploads-page.tsx` — the page and its tabs; the
  route is `src/routes/_pomodoro/uploads.tsx`.
- `src/components/pomodoro/media-uploads-section.tsx` — the cards, the tick
  boxes and moving to the bin.
- `src/components/pomodoro/upload-bin-view.tsx` — the Bin tab.
- `src/server/pomodoro/upload-bin.ts` — moving to the bin, bringing back,
  emptying and the 30-day clear-out.
- `src/server/pomodoro/storage-warning.ts` — the space warning.
- `src/routes/api/pomodoro/uploads.$mediaId.download.ts` — the download.
- `src/server/pomodoro/media-worker.ts` — stills, the catch-up pass and the
  bin clear-out, beside the re-encode.
- Migration 0136 — `deleted_at`, `still_path`, `pomodoro_storage_warnings`
  and the AI file names. Migration 0137 — `pomodoro_bucket_deletions` and the
  trigger that notes stills to remove.
