# Import from a link

Paste a TikTok, Instagram or YouTube link into the editor's Media panel and
the video is downloaded and saved as one of your own files in that project,
ready to drag onto the timeline. Tyler asked for it on 17 Nov 2026: "I want
the ablity to import clips from tiktok, ig and yt shorts by entering the url
and it saves the clip".

## Where it is

The **+** at the top of the Media panel has Import from a link, under From
your phone. The window has one box for links, one per line, and a Collection
dropdown when you have collections (None to start with). Import starts every
good link at once and the window closes.

- **A line that is not a video link** stays in the box, with the reason under
  it in red: "Only YouTube, TikTok and Instagram video links can be imported."
  The good lines still start. Closing the window then does not ask about
  throwing the refused lines away.
- **The same video twice in one project** is left out with "Already in this
  project". A youtu.be link and a /shorts/ link to the same video count as the
  same video.
- **At most 20 links in one paste**, so one paste cannot fill the server's
  disk.
- **A guest sent from Project** has no Import from a link, the same as they
  have no collections.

## Which links work

- **YouTube:** `youtube.com/shorts/…`, `youtube.com/watch?v=…` and
  `youtu.be/…`.
- **TikTok:** `tiktok.com/@name/video/…`, and the short `vm.tiktok.com/…` and
  `vt.tiktok.com/…` links the app shares.
- **Instagram:** `instagram.com/reel/…`, `/p/…` and `/tv/…`, with or without
  the creator's name before them.

Every other address is refused before anything is fetched. That check is
`parseVideoLink` in `src/server/video/viral/download.ts`, the same one Viral's
downloads use, and it is the guard that stops the server being sent to fetch
any address somebody types.

## While it downloads

The window closing does not wait for the download. A **Downloading from
TikTok** tile shows at the top of the Media panel, with the post's title once
known, and turns into the normal video tile when the file lands. The panel
asks after it every 4 seconds while any is on its way, and stops asking when
none is. A download keeps going with the tab closed.

A Downloading tile cannot be dragged onto the timeline yet, because there is
no file. The tiles show under All media only: a type filter that hides
videos, a collection picked in the filter, or a search hides them.

## What is kept

- **The file** is saved in the media library as your own upload and put on
  this project's shelf, and in the collection picked.
- **Its name** is the post's title with the hashtags, apostrophes and emoji
  taken out, cut to 80 characters. With no title it is the platform and the
  day, such as "TikTok 18 Nov".
- **The creator and the link:** right-clicking an imported file shows "From
  @handle" and Open the original, which opens the post in a new tab. Crediting
  the creator is up to the person who imported it.

## Too big, and other failures

The library holds a video up to 100MB, so a bigger one is refused: its tile
turns red with "Over 100MB, too big to import." and nothing is saved. Shorts,
Reels and TikToks are nearly always well under that. Other reasons a tile
turns red: "This post is private.", "This post is gone or can't be watched.",
and "The platform wants a sign-in before it hands this post over."

Right-click a red tile for **Try again**, which puts it back in the queue, and
**Remove**, which takes the tile away. Pasting a failed link again also starts
it again.

A short TikTok link only says which video it is once it is downloaded. If
that video is already in the project, the new tile turns red with "Already in
this project" and nothing new is saved.

## The worker

Each pasted link is a row of `video_link_imports` (migration 0182), one per
video per project. The worker in `src/server/video/link-imports.ts`, named
`video-link-imports` in `src/app/server-options.ts`, runs with the app's other
background work every 15 seconds:

- **It downloads at most 4 at once for everybody, and 5 per person.** The
  rest wait their turn, oldest first.
- **It does not hold up the other background work.** A pass starts the
  downloads and moves on; the claim on each row is what stops the next pass
  taking the same one.
- **A restart puts a download back in the queue.** A claim lasts 10 minutes,
  and yt-dlp gives up on one download after 3.
- **Removing a tile mid-download** throws the downloaded file away when it
  finishes, rather than leaving it in the library.
- **Deleting the file deletes its row**, so the same link can be imported
  again. A file only taken off this project's shelf goes back on it when its
  link is pasted again, without a second download.

yt-dlp is installed on the live server by the repo's `Dockerfile`, with the
`--impersonate chrome` support TikTok needs.
