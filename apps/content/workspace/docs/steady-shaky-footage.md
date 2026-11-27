# Steady shaky footage

A video clip's Steady card has one switch, Steady this clip. Turned on, the
background worker makes a steadied copy of the video, and the clip plays the
copy once it's ready. Tyler, 4 Nov 2026: "Switch per clip".

## What you see

- **While it's made:** a spinner line under the switch says the copy is being
  made, the clip plays as shot until then, and an export waits for it.
- **When it's ready:** the preview swaps to the steadied copy by itself.
  Nothing else changes on the timeline.
- **When it fails:** the line gives the reason and a Try again button, the
  same as Clean up the voice ([clean-up-the-voice.md](clean-up-the-voice.md)).
  The clip plays as shot.
- **Turning it off** goes straight back to the original. The copy is kept, so
  turning it on again is instant.

## One copy per file

The copy belongs to the file, not the clip (`video_media_steady_copies`,
drizzle/0154). Every clip of the same video shares it however it's trimmed, and
a second clip with Steady on costs nothing more. Deleting the file deletes the
row.

## How the worker steadies

`buildSteadyCopy` in `src/server/video/media-workers.ts`:

- **With libvidstab** (two passes): `vidstabdetect` works out how the camera
  shook, then `vidstabtransform` takes the shake out with `smoothing=15` and
  `optzoom=1`. That grows the picture just enough to hide the moving edges,
  followed by a light `unsharp` to win back the softness the growing adds.
- **Without libvidstab:** ffmpeg's built-in `deshake`, in one pass. It's
  gentler and handles small jitters better than big swings.
- **Which one runs:** the worker asks its own ffmpeg once (`ffmpeg -filters`)
  and uses vidstab when it's there. Homebrew's ffmpeg on a Mac doesn't have
  it, so local copies use `deshake`. Whether the live server's Alpine ffmpeg
  has vidstab wasn't checked when this was built. The first live copy settles
  it, and the worker picks the better one either way.
- **Size and scrubbing:** at most 1080 pixels on the shorter side, which is
  as big as any export draws, at H.264 quality 20. It has a keyframe every
  second so the editor can scrub it, and the original's sound re-encoded
  alongside.
- **Big files:** it reads the original through the same file cache as the
  smooth copy ([big-files.md](big-files.md)), so it waits for disk room the
  same way. It gets twice the smooth copy's time limit, because it reads the
  video twice.

## Exports

- **The picture comes from the steadied copy**, and the sound from the
  original, which is the same sound.
- **An export waits for the copy.** One asked for while the copy is still
  being made fails with the sentence "A steadied copy is still being made for
  a clip with Steady on. Export again once it is ready, or turn Steady off on
  that clip." It never quietly draws the shaky original. A failed copy gives
  its own sentence pointing at Try again.

## Not included

Steadying every upload automatically, and a strength slider.
