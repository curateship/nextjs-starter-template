# Even out clip volume

Every video or sound you drag from the Media panel onto the timeline arrives
set to play at one loudness. A quiet recording and a loud recording of the same
voice end up sounding alike. Tyler, 4 Nov 2026: "Every clip, automatic".

## How it works

- **Each file is measured once.** The background worker measures a file's
  loudness while it builds the file's sound shape (`drawWaveform` in
  `src/server/video/media-workers.ts`). It keeps the answer in
  `video_media_loudness`, the table the Ads panel already used to match an ad
  to the voice. The unit is LUFS, the loudness measure the export's own
  levelling uses.
- **The drop reads it.** When a file is dropped, the editor asks for its
  loudness. A file the worker hasn't reached yet is measured right then. A
  drop waits at most 4 seconds for the answer. After that it lands as
  recorded, and the measuring carries on, so the next drop of that file is
  levelled.
- **The clip keeps the change** as `levelDb`, in decibels
  (`src/lib/video/clip-level.ts`). Its Volume slider works on top of it, so
  turning a clip down still turns it down.

## The numbers

- **Target: -18 LUFS.** That is a little under the export's -14, so a raised
  clip has room before its loudest moments clip. The export's own levelling
  then lifts the finished mix to -14.
- **Raise at most 12 dB.** A near-silent file raised further would mostly be
  hiss.
- **Lower as far as needed**, down to -40 dB.
- **Under half a decibel** of change is too small to hear, so the clip is
  left as recorded.

Worked example: a voice recorded at -26 LUFS arrives raised by 8 dB. The same
voice recorded close to the mic at -12 LUFS arrives lowered by 6 dB. Both play
at -18. The export test (`render-editor-features.test.ts`) does exactly that
with a tone and measures the two finished files within 1 LU of each other.

## What it doesn't touch

- **Clips already on a timeline** stay as they are. Only a new drop is
  levelled.
- **Music, starter sounds, voiceovers and ads** keep the levels they were
  made with. Music arrives ducked at a quarter volume on purpose
  ([background-music.md](background-music.md)), and an ad matches the voice
  its own way ([ads.md](ads.md)).
- **Pictures** have no sound.
- **Replacing a clip's file** drops the change, because it was worked out
  for the old file.
- **Copy look** doesn't carry it, because it belongs to the file, not the
  look.

## Preview and export differ on a raise

A browser plays a file at most as loud as it was recorded. So the preview plays
every lowering exactly, but a raised clip plays only as loud as its file. Only
the export plays it raised. A quiet clip next to a loud one sounds quieter in
the preview than it will in the export. Making the preview raise it too would
mean sending all its sound through the browser's Web Audio, and an R2 file
without the right CORS answer then plays silent.
