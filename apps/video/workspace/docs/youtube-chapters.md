# YouTube chapters

An export's window has a Chapters card. It lists the export's named markers as
lines like "0:00 Intro", ready to paste into a YouTube description, and has a
Copy chapters button. No AI names anything. Tyler, 4 Nov 2026: "Markers you
place".

## Where the lines come from

- **Named markers only.** A marker is a pin on the timeline's ruler
  ([timeline-markers.md](timeline-markers.md)). An unnamed one is left out.
- **The markers the render drew, not today's.** The render keeps the export's
  markers on its row (`video_render_jobs.markers`, drizzle/0154), the same way
  it keeps the scene lines and the Made by AI list. Moving a marker afterwards
  never changes an export's chapters.
- **Part of a video.** An export of one stretch keeps only the markers inside
  it, counted from the stretch's start.
- **Intro.** When the project has an intro ([intro-and-outro.md](intro-and-outro.md)),
  the render moves every marker later by the intro's length and puts an
  "Intro" chapter at 0:00.
- **Exports made before 4 Nov 2026** have no markers kept. The card says to
  export again.

## YouTube's rules

YouTube makes chapters from the lines only when all three of these hold
(`src/lib/video/youtube-chapters.ts`):

- **The first line is 0:00.** When no named marker sits in the first second,
  the card adds a "0:00 Start" line at the top.
- **At least 3 chapters.**
- **Each chapter lasts 10 seconds or more.** The last one runs to the end of
  the file.

When a list breaks a rule, the card says which one in a sentence under the
lines and names the chapters that are too short. Copy still works, because the
lines are still useful as plain timestamps.

Times are whole seconds rounded down, written "1:35", or "1:02:03" once an hour
has passed, which is how YouTube reads them.

## Worked example

Markers at 0s "Intro", 40s "The trick" and 95s "Outro" in a 2 minute export
copy as:

```
0:00 Intro
0:40 The trick
1:35 Outro
```

Each lasts at least 25 seconds, and there are three, so the card shows no
warning.
