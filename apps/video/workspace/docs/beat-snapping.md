# Snapping to the beat

Clip edges snap to the beats of the music in a project, so cuts land on the
music the way montage edits do.

## What you see

- **Ticks:** a music clip on the timeline has a short faint tick at the top
  for each beat inside it.
- **Snapping:** dragging or trimming any clip, on any lane, pulls its edges
  onto a beat when one is close, on top of the clip edges and the playhead it
  already snapped to. The pull is the same 8 screen pixels at every zoom.
- **Turning it off:** holding Alt while dragging turns all snapping off,
  beats included, as it always has.
- **The music clip itself:** a music clip being dragged does not snap to its
  own beats, because they move with it.

## Which files have beats

Only sound files marked as music on the Music panel (see
[background-music.md](background-music.md)). Marking a file queues its beats
and starts the background worker on them at once, and the editor keeps asking
until they are found, so the ticks arrive without a reload. Files marked
before this existed are picked up by the worker's look round every fifteen
seconds. Nothing else is looked at, so a voiceover never grows ticks.

## How the beats are found

No paid service: the worker decodes the file to one channel and runs
`findBeats` in `src/lib/video/beats.ts`.

1. It cuts the sound into frames of 23 milliseconds and measures how much each
   one is louder than the one before. A drum hit is a big jump and a held note
   is none.
2. It finds the gap between jumps that repeats most, between 60 and 180 beats
   a minute, leaning towards 120 so a song is not read at half or twice its
   speed.
3. It lays a grid of beats at that gap, slid to where it lines up with the most
   jumps.
4. It pulls each grid beat onto the nearest real jump close by, then fits one
   straight line through them, so a gap a hair too long does not drift a whole
   beat off by the end of a long song.

## How well it does

- **Steady beats:** on click tracks at 90, 120, 128 and 140 beats a minute,
  one of them under steady hiss, every beat was found within 15 milliseconds,
  and the tempo was right to the whole beat a minute. At 120 the ticks sit
  half a second apart (`src/lib/video/beats.test.ts`).
- **No beat:** a held tone and silence come back with no beats, and so did a
  real voiceover on this machine.
- **On this machine:** the "Sample music (12s test tone)" file came back at
  119.9 beats a minute with 24 beats, and a clip dragged to 3 pixels short of
  the beat at 2.695 seconds landed exactly on it. A click track uploaded on
  the Music panel and laid under the video showed its 24 ticks within a
  minute, with no reload.
- **Not yet tried:** a real song with a slow or swinging beat. The finder
  assumes the tempo holds steady, which most music for short videos does. A
  song that speeds up or slows down will drift off its beats, and a song read
  at half its speed gets a tick on every other beat.

## How it is stored

A row per music file in `video_media_beats` (migration 0144): the beat times in
milliseconds from the start of the file, never from a clip, so trimming,
moving or speeding up a clip never makes them wrong. Each clip turns them into
its own timeline places with `beatTimelineTimes`, the same sum its waveform is
drawn with (see [waveforms.md](waveforms.md)). An empty list means no steady
beat was found. Deleting the file removes the row. Beats that failed after
three tries are tried again when the file is marked as music again. A file
still not found after ten minutes of asking gets no ticks in that editor.
