# How YouTube is run

Nothing has run against the real YouTube yet. Every browser routine and
phone step was written on 26 Nov 2026 from how YouTube's pages and app are
put together, with no channel to sign in with. The first run with a real
signed-in channel is their test.

## In a browser

`docker/browser/routines/youtube.py` is the only file that knows how a YouTube
page is put together. Every page detail is in its one `SELECTORS` block.

| Routine | What it does | Its time |
| --- | --- | --- |
| `state` | YouTube's front page, then `youtube.com/profile`, which sends a signed-in visitor to their own `/@handle` | 90 seconds |
| `quick_state` | The page on screen only: `ytcfg`'s `LOGGED_IN`, the `/@handle` in the address, and ban words. Never moves the page | 90 seconds |
| `upload` | YouTube Studio's upload window, as in [YouTube](youtube-module.md) | 40 minutes |
| `health` | The channel page's subscribers and videos, each video's numbers, and the newest comments under it | 10 minutes |
| `inbox` | The comments under the five newest videos | 270 seconds |
| `reply` | The video found by its title on the Videos tab, the comment by its author and words, Reply, the words typed | 570 seconds |

The app waits a little longer than each routine (`src/server/social/youtube/calls.ts`),
and each job's claim a little longer than that (`src/server/social/jobs.ts`):
an upload's routine 40 minutes, the app 42, the claim 60, which leaves room
for a cold browser, a phone's queue and the look at who is signed in after.

- **Signed in, with no handle on screen,** writes nothing down either way.
- **A file** is downloaded from an https address only, out on the internet,
  with no redirect followed, up to 5 GB in 30 minutes, then deleted.
- **Save waits** until YouTube says "Upload complete", or that checks or
  processing began, because a browser that closes mid-upload stops it.
- **The ban words** are matched only as a short line of their own, so a video
  titled "How my channel was terminated" is not taken for one.

`docker/browser/test_youtube.py` proves the readers and refusals: 19 tests.
The promo-browser image must be rebuilt for the routine to exist in it.

## On a phone

The YouTube part of `rack/promo_rack.py`, Android only, package
`com.google.android.youtube`.

| Step | What it does |
| --- | --- |
| `youtube/quick_state` | The You tab's `@handle` |
| `youtube/health` | The You tab or channel page's subscribers and videos, then each video opened by its link. Comments come by notification instead |
| `youtube/upload` | The share screen, as in [YouTube](youtube-module.md), then waiting for "Upload complete" |
| `youtube/inbox`, `youtube/reply` | The shared comment steps Instagram's and Threads' use, through YouTube's Notifications |
| `youtube/ban_look` | The weekly look at a banned channel |

- **The file** is streamed to the rack's disk, never held in memory, up to
  5 GB in 15 minutes, then pushed to the phone and deleted from the rack. The
  phone's copy is deleted only once YouTube says the video is in, or the
  upload stopped, because the app reads the file while it uploads.
- **One deadline** covers the whole phone upload: 36 minutes from the
  download's start, inside the app's 42. Upload is not pressed with less than
  5 minutes left, so the app never gives up on an upload the phone is still
  making.
- **The description** is put into its box whole, as a paste is, since 5,000
  characters typed a key at a time would take ten minutes. The title is
  typed at a person's pace.
- **The self-test** walks the upload to the Create button's Upload a video,
  found and not pressed. It skips YouTube's walks on a phone without the app,
  and on an iPhone.
- **The AI question** must be found when the answer is Yes. When the answer
  is No it is answered if shown, since No is YouTube's own answer.
- **The rack program's version** went to `2026.11.26.1`, so racks take the
  new steps.
- **A fix for Threads came with it:** reading who is signed in looked up an
  iPhone table Threads has none of, so every Threads look answered "not
  checked". An Android-only app now has no iPhone table to ask.

`rack/test_promo_rack.py` has 14 YouTube tests among its 286, five of them
walking the steps on a fake phone: the upload pressed once with its file kept
until YouTube has it, an AI-made video never uploaded without its answer, and
every rehearsal finding its last button without pressing it.

## Still owed

- **The live database** needs `drizzle/0243_promo_youtube.sql`.
- **The promo-browser image** on the live server needs rebuilding for
  `youtube.py`. The local image was rebuilt on 26 Nov 2026 and lists all six
  YouTube routines.
- **The racks** take rack program `2026.11.26.1` on their next update.
- **A real channel,** signed in once in a browser profile and once on an
  Android phone, is the only proof any of it works on YouTube.
