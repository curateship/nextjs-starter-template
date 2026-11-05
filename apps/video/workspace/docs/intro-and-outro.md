# Intro and outro

A project's Settings window has an Intro and outro card. Pick a video for each,
and every export of every video in the project starts with the intro and ends
with the outro. Tyler, 4 Nov 2026: "Per project".

## Setting them

- **Where:** Project settings, from the cog on the projects list or the AI
  spend figure in the editor. The card has an Intro choice and an Outro
  choice, each None or one of the videos in this project's Media.
- **A video from another project** has to be added to this project's Media
  first. The choice lists only this project's videos, up to 100.
- **Saved with Save changes**, like the name and the look. The server refuses
  anything that isn't one of the person's own videos.
- **Kept on the project** as `video_projects.intro_media_id` and
  `outro_media_id` (drizzle/0154). Deleting the file in the media library
  takes it off the project. The card then shows None, and exports go on
  without it.

## Exports

- **Added outside the timeline.** The editor never shows them. When an export
  starts, the queue wraps the timeline it's about to draw
  (`withIntroOutro` in `src/lib/video/intro-outro.ts`). Everything moves
  later by the intro's length, the intro plays first on a lane of its own,
  and the outro plays after the last clip.
- **Fitted to the export's shape** by the usual fit rule, inside the frame with
  black where the shapes differ, because they are ordinary video clips to
  the export.
- **How long they run** is read by ffprobe when the export starts
  (`src/server/video/intro-outro.ts`), because nothing stores a video's
  length. One whose length can't be read is left out rather than failing the
  export.
- **The Export window's switch** "Add the intro and outro" shows only when the
  project has one. It starts on, and turning it off leaves them out of that
  one export (`video_render_jobs.with_intro_outro`).
- **An export of part of a video never has them.**

## What counts the intro

Because the export draws one ordinary, longer timeline, everything worked out
from that timeline already counts the intro:

- **Chapters** ([youtube-chapters.md](youtube-chapters.md)) move later by the
  intro's length, and "0:00 Intro" opens the list.
- **Scene lines** on the retention curve ([retention-curve.md](retention-curve.md))
  and **ad marks** start after the intro.
- **The Made by AI card** reads the same timeline. An intro made by hand adds
  nothing to it.

`render-editor-features.test.ts` exports a grey video with a white 2 second
intro and measures white at 1 second and grey at 3.

Worked example: a 3 second intro on a 60 second video makes a 63 second file.
A marker at 0:40 becomes the chapter 0:43.
