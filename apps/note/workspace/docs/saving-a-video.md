# Saving a video

A video gets into the library two ways: a pasted link, which the server
downloads, or a file uploaded from the computer. Either way the click only
writes a row and returns. The slow part happens in the `note-videos` worker,
so closing the browser never stops a download.

## Which links work

`src/server/note/links.ts` decides, and the tests beside it cover every case.

- **YouTube**: `/watch?v=`, `/shorts/` and `youtu.be` links. The video id is
  read from the link at once.
- **TikTok**: `tiktok.com/@name/video/<id>` gives its id at once. The shortened
  `vm.tiktok.com/<code>` and `tiktok.com/t/<code>` links only say which video
  they are once followed, so yt-dlp names them after the download.
- **Instagram**: `/reel/`, `/reels/`, `/p/` and `/tv/` links.
- **Any other `https` link yt-dlp can read**, such as Vimeo, when its host is a
  public site. yt-dlp names the site and the video after the download.
- **Refused with "That is not a link to a video"**: anything that is not an
  `https` address, a page on the three sites that is not one video (a channel,
  a profile), and any other link whose host is this machine (`localhost`,
  `*.localhost`), a bare IP number, a name with no dot, or a name that answers
  with a private or loopback address.

That last check is the guard on what yt-dlp may be pointed at, because yt-dlp
fetches whatever it is given from inside the server. The worker runs it again
just before the download, in case the name points somewhere else by then. It
cannot see where a site redirects to once yt-dlp has started, so a public site
that redirects to an inside address is the one case it does not stop.

**Saving the same video twice is one row.** For the three sites the database's
unique index (owner, site, video id) catches it at once and the screen says
"That video is already saved" and opens it. For any other link, and a shortened
TikTok link, the twin is found after the download: the new row is deleted and
the one saved earlier is what stays. A plain page or a direct file link is
never folded, because yt-dlp's id for one is only the last part of its
address, and two different sites' `/intro` pages would look the same.

**One person may save sixty links in ten minutes**, the allowance the shell
gives uploads, because each one is a download of up to 500MB.

**Instagram reels by their own link, measured 18 Oct 2026:** two public reels
from yt-dlp's own test list (`instagram.com/reel/Chunk8-jurw/` and
`instagram.com/reels/Cop84x6u7CP/`) downloaded without signing in, from this
machine, with the worker's own settings. One went all the way through the app:
saved in 14 seconds with its cover and its length. Instagram does not say how
long a reel is, so the length came from ffmpeg reading the file. Instagram
changes what it allows often, and a reel it wants a login for fails with
yt-dlp's own sentence on the card.

## Uploads

- **The Upload button takes mp4, mov and webm video files up to 500MB.** A
  bigger file is refused before anything is sent ("Up to 500MB"), and so is one
  the browser can tell is over 30 minutes long ("Longer than 30 minutes").
- **The file goes through the shell's own uploader** (`uploadMedia` in
  `src/lib/api/media/media.ts`): ten megabytes at a time, four at once, three
  tries each, straight to the storage bucket. The card says "Uploading 42%"
  meanwhile. Then `finishUpload` checks the file is the person's own and writes
  the row, named after the file without its extension.
- **The worker then looks at the file once**: it takes the cover and reads the
  length. When Analyse is pressed before the worker got to it, the analysis
  takes the cover instead. A file over 30 minutes is refused there too, its
  file deleted, and the bell says so. A file that is fine rings nothing,
  because the person watched it arrive.
- **Sound files cannot be uploaded yet.** The shell's uploader refuses every
  sound file a browser sends: its first-bytes check has no rule for sound, and
  it caps sound at 50MB in one request rather than 500MB in pieces. Taking mp3,
  m4a and wav needs that changed in the shell. Everything after the upload
  already handles sound: a sound file gets the same analysis, a sound mark
  instead of a cover, and `<audio>` instead of `<video>`. A link whose best file
  is sound only (a podcast page, say) is saved as sound today.
- **The bucket must accept uploads from the site's address.** A bucket whose
  CORS rule does not list the address refuses the pieces, and the shell's own
  error says to check the rule in Cloudflare.

## The limits

**Up to 30 minutes and about 500MB**, for links and uploads alike. Tyler set
both on 17 Oct 2026.

- yt-dlp is told `--match-filter "duration <=? 1800"`, which refuses a longer
  video before any bytes move: "Longer than 30 minutes". The `?` lets through a
  site that does not say how long its video is (Instagram is one), and the
  worker refuses it after reading the length off the file.
- yt-dlp is told `--max-filesize 500M`, and the file is measured again once the
  video and sound halves are joined: "Bigger than 500MB".
- The file is the best one up to 720p, preferring H.264 video and AAC sound,
  because every phone's player plays that pair. It comes out as mp4.

## The worker

`note-videos` (`src/server/note/jobs.ts`) rides the shell's 15-second loop: the
dev server's ticker locally, and `worker/` in production. It is listed in
`src/app/server-options.ts`.

- **One job at a time per process, claimed in this order**: put back anything
  whose worker went away, then one video queued for analysis, else one link
  waiting to download, else one upload nobody has looked at yet.
- **The tick starts the job and does not wait for it.** The shell's pass waits
  for every worker on it, so a 15-minute download would hold up emails and
  automations, and the production worker's health check counts a pass longer
  than two minutes as a stopped worker. The next tick starts nothing while the
  job is still going.
- **A claim is a 20-minute lease**, pushed forward between steps. Every write
  checks the lease is still this worker's. A write that finds another lease, or
  no row because the video was deleted meanwhile, throws its own work away and
  removes any file or cover it had stored. A cover taken for a video that
  Analyse took over meanwhile is still given to that video.
- **A restart is harmless.** A download whose lease ran out goes back to
  waiting, and an analysis back to the queue, on the next tick. Nothing is ever
  left with no status.

**A download, step by step**: yt-dlp fetches the file into a folder of its own;
the row learns which video it is (and folds into a twin if there is one); the
file goes up to the bucket ten megabytes at a time, never read into memory
whole; a library row is written for it the way the shell writes one; ffmpeg
takes one frame from a second in as the cover at
`note-covers/<owner>/<video>.jpg`; the row becomes `saved` and the bell says
"Ready to analyse: <title>".

## Failures and Try again

- A failed row keeps its reason, up to 500 characters, and yt-dlp's own last
  error line is kept as the reason, so "This video is unavailable" or "This
  post is private" reaches the card rather than "download failed".
- **Only sentences written for the owner reach the card and the bell.** A
  server error, such as a database error with its query in it, stays in the
  server log, and the card says "Something went wrong on the server. Try
  again."
- **A download that fails** deletes any file it had stored, so Try again
  downloads it again from the start.
- **An analysis that fails keeps the file**, so Try again goes straight back to
  the analysis queue.
- An upload whose file has gone cannot be tried again; it says to upload the
  file again.
- Only the owner can press Try again. Anybody else's video is "Video not found".
- Each failure rings the bell once: "Failed: <title>" with the reason under it.
  A link that failed before it had a title is named after its site.

## What Delete removes

The stored file, the cover, the library row and the video row, in that order.
A step that fails stops the rest, so pressing Delete again finishes the job.
A file a sent newsletter carries is kept in the library, the shell's own rule,
because an inbox copy can outlive every record of the email.
The original on YouTube, TikTok or wherever stays where it is. A worker part
way through the video finds its row gone and throws its work away.

## What a deploy needs

- `WORKER_PACKAGES="ffmpeg yt-dlp"` on the worker image, as Video's has. yt-dlp
  must be built with `curl_cffi` for `--impersonate chrome`.
- A storage bucket saved in Settings → General, whose CORS rule lists the
  site's address for uploads.
- A Gemini key saved in Settings → AI for Analyse.
- Migrations `0096_note_videos.sql` (the tables) and
  `0097_note_videos_menu.sql` (the menu link) run on the way in.

## The tables

`drizzle/0096_note_videos.sql`, mirrored in `src/server/note/schema.ts`:

- `note_folders`: one person's folders, unique on owner and lowercased name.
- `note_videos`: one saved video. Unique on owner, site and video id once the id
  is known, and on the stored file, so one file is never shared by two videos.
  The status is the job.
- `note_notice_links`: which video a bell notice is about, so clicking it opens
  that video. Deleting either side takes the link.
