# Times and lengths

Every length and time Video writes on screen comes from one function,
`formatClock` in `src/lib/video/timeline-utils.ts`, so one length reads the
same everywhere. The Made by AI paragraph copied into a YouTube or TikTok
description uses it too ("Picture at 0:04"). YouTube chapter lines do not;
see the last bullet.

- **The shape:** "0:34", "12:00", or "1:05:04" once there are hours.
- **Rounded to the nearest second.** A project 33.7 seconds long reads 0:34
  on the projects list, the Exports page and in the Export window.
- **Never "0:60".** 59.996 seconds reads 1:00.
- **Running clocks round too.** The playhead readout, a recording's timer and
  "so far" counts use the same rule, so they move on to the next second half
  a second early. That is too small to notice, and one rule beats two.
- **Typing a time** (the Export window's From and To) is read by
  `parseClockText` in `src/lib/video/export-stretch.ts`, which takes back
  anything `formatClock` writes.
- **The Viral breakdown's "m:ss.cc"** times are a different, exact form,
  `formatTimecode` in `src/lib/video/viral-breakdown.ts`.
- **YouTube chapter lines round down** (`chapterTime` in
  `src/lib/video/youtube-chapters.ts`), because YouTube reads them that way
  and needs the first one at 0:00 ([youtube-chapters.md](youtube-chapters.md)).
