# Looping a clip

A video or sound clip can loop: when its file runs out it starts again from
its beginning, so the clip can be stretched on the timeline as long as it is
wanted. It was added on 14 Nov 2026 for study videos, where an 8-second
animated scene runs under three hours and 30 seconds of rain runs under all of
it (the Pomodoro flow, `workspace/tasks/flow/02-pomodoro-flow.md`). Without
it, three hours of an 8-second scene would be 1,350 clips, and a lane holds
500.

## Where it is

- **The Loop card** in a video or sound clip's inspector, under Speed, with
  one switch, Loop this clip (`studio-inspector.tsx`). It shows on clips
  whose file length is known, which is every video and sound from Media.
- **On:** the clip's right edge can be dragged out past its file's end
  (`studio-timeline.tsx`), and Replace media keeps the clip's length.
- **Off again:** the clip is cut back to what is left of its file, so it
  never ends on a held last frame.
- **Splitting** a looped clip gives the right half the place the loop had got
  to, so nothing jumps.

## How it plays

`loop` on the clip (`timeline-schema.ts`), which needs the file's length.
Where the file is at a moment of the clip is worked out in one place,
`playbackSourceMsAt` (`src/lib/video/clip-playback.ts`): the usual place,
taken round the file's length. The preview and the export both use it.

- **Preview** (`editor-preview.tsx`): the video or sound element is set to
  loop and seeked by that place. A looped clip never sets the playhead's
  time, because a file wrapping to its start would send the playhead back;
  the playhead keeps ordinary time over it.
- **Export** (`render.ts`): the clip's input is read with `-stream_loop -1`,
  starting at that place. Measured on 14 Nov 2026 (`render-loop.test.ts`):
  ffmpeg's later passes start from the file's beginning, not from where the
  first pass started, which is exactly what the preview does. A looped file
  is fetched whole to the server's disk first (`render-sources.ts`), because
  a looped input is read again on every pass and reading it over the network
  would fetch it once a loop.
- **Sound** that loops is decoded once to WAV in the render's own folder, so
  the padding an mp3 carries can't click at the wraps. On this machine's
  ffmpeg a LAME-made mp3 looped cleanly even without that; the WAV covers
  sound files that don't carry the gapless note.

## What still reads the file once

Captions, the transcript, beats, punch-ins and ads keep reading the file as
if it played once (`sourceMsAt`). None of them has a meaning on a looped
clip.
