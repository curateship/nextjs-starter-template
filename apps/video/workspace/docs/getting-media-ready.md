# Getting a video ready to scrub

A video you upload is not ready to scrub straight away. The editor says so in
two places while the background worker is still working on it, and says so
again, with a way to try again, if the worker gives up.

## What the worker makes

Every video in the library gets two things made for it in the background, by
`src/server/video/media-workers.ts`.

- **The smooth copy:** a 720p copy with a keyframe every second. The editor
  plays and scrubs this copy instead of the original, because a phone video
  can have a keyframe only every few seconds, and jumping around in it sticks.
  It lives in `video_media_proxies`.
- **The frames:** one picture every 2 seconds, at most 120, tiled into one
  image. The timeline draws these along a video clip. They live in
  `video_media_filmstrips`.

Pictures and sound files get neither, so they are never marked.

## How long it takes

- **Before it starts:** the worker runs every 15 seconds, and a new upload is
  picked up on the next run. Until then the file has no rows at all, and the
  editor treats that as "getting ready".
- **Measured locally:** a 40-second 1080p video was ready about 14 seconds
  after its upload finished. Both markers were gone by then, with no reload.
- **Longer files take longer.** The worker allows up to 30 minutes for a
  smooth copy and 15 minutes for the frames before it counts a try as failed.
  Nothing has been timed on the Hetzner server yet.

## What the markers mean

- **"Getting it ready to scrub"**, under a video in the Media panel, with a
  small spinner: the smooth copy or the frames, or both, are still being
  made. Scrubbing that file sticks until the line goes.
- **"Getting frames ready"**, along the bottom of a video clip on the
  timeline: that clip's frames are still being made. The clip shows its plain
  coloured fill until they arrive, and they replace it in one paint without
  the clip moving or changing size.
- **"Couldn't get it ready to scrub"** with a **Try again** button, under a
  video in the Media panel: the worker tried the smooth copy or the frames 3
  times and gave up on it. The file still plays and exports from the original.
  This shows even when the other half is still being made, so a file never
  says it is getting ready while half of it has already failed.
- **"Frames failed, retry in Media"** on a timeline clip: the frames gave up.
  The button to try again is the one in the Media panel. Pressing it starts
  the clip waiting for its frames again, without a reload.

The rule that turns the two stored statuses into one of these is
`mediaPreparation` in `src/lib/video/media-preparation.ts`.

## Trying again

**Try again** puts only the half that failed back in the queue, with a fresh
3 tries. A half still being made is left alone, so pressing it never restarts
work already under way. Only the file's owner can press it; anybody else gets
"Media not found". The code is `retryOwnedMediaPreparation` in
`src/server/video/media-list.ts`.

A failure that is really "ffmpeg is not installed" fails again the same way,
because trying again does not install it.

## How often the editor asks

Neither marker asks the server constantly.

- **The Media panel** asks for its list again 5 seconds after each answer,
  and only while at least one video on screen is still getting ready. The next
  request never goes out before the last one has answered. It stops when
  nothing is left getting ready.
- **A timeline clip** asks `GET /api/v1/video/media/{mediaId}/filmstrip`,
  which answers 202 with `Retry-After: 2` while the frames are being made. The
  clip asks again after the 2 seconds the route asks for. Every clip cut from
  the same file shares one set of requests.
- **It keeps waiting for as long as it takes.** It used to give up after 2
  minutes, which left a long video's clip empty for good.
- **It stops when nobody is looking.** When the last clip waiting on a file
  scrolls out of view or is deleted, the requests stop. They start again if
  the clip comes back.
- **A failed strip** answers 422, so the clip can say so instead of waiting.
  The browser's console shows that 422 as a failed request, which is expected.
- **Measured locally:** in one minute with nothing getting ready, the editor
  sent no media or frames requests at all.

## Limits worth knowing

- **A clip added before the smooth copy was ready keeps playing the original**
  until the project is opened again. The clip's address is fixed when it is
  added, and a project's addresses are worked out afresh each time it opens.
  So the Media panel can already say the file is ready while that clip still
  sticks when scrubbed.
- **The timeline marks the frames only.** It has no marker for the smooth
  copy.
- **Sound shapes are not marked.** A sound file's waveform is built by the
  same worker, and `waveforms.md` says what shows while it is missing.
