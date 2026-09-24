# Saving a frame as a picture

One moment of a video can be kept as a picture, for a YouTube thumbnail or a
still for a post. It lands in the media library as an ordinary image, so it
can be downloaded, used in another project, or dropped onto a timeline.

## Two ways in

- **From a finished export:** open the export from the Exports page, move the
  "Take it from" slider, and press **Save as a picture**. The button sits
  beside **Use this moment**, which sets the gallery cover from the same
  slider.
- **From the editor:** press the picture button at the right end of the play
  bar, under the preview. It saves the frame under the playhead. Playback
  stops first, so the frame on screen is the one kept.

## What size it is

- **From an export:** every pixel of the export. A best-quality 16:9 export
  gives 1920 × 1080; a medium 9:16 one gives 720 × 1280. The gallery cover
  stays at 640 wide; the saved picture is taken separately, straight from the
  video file.
- **From the editor:** the size a best-quality export of the project would be.
  That is 1920 × 1080 for 16:9, 1080 × 1920 for 9:16, 1080 × 1080 for square,
  and 1440 × 1080 for 4:3.
- **Format:** JPEG at high quality. The frames saved in testing came out
  between 27 KB and 115 KB, well under YouTube's 2 MB limit for a thumbnail.

## Where it goes

- **The media library:** an ordinary image row, owned by whoever saved it, in
  the site they were working in.
- **The project's shelf:** it is put on the Media panel of the project the
  frame came from. From an export, that is the project the export was made
  from. From the editor, the panel shows it straight away with no reload.
- **Its name:** the project and the moment, for example
  `Summer trip at 1m 05.4s`. There is no colon, because the library only keeps
  letters, numbers, spaces, dots, dashes and underscores in a file name.
  Brackets and other marks are dropped the same way, so
  `Word captions test (Claude)` saves as `Word captions test Claude at 5.7s`.
  The confirmation message shows the name as it was stored.
- **Never email-protected:** like every picture the app makes itself, a saved
  frame is free to delete until a newsletter carries it
  (`src/server/video/asset-factories/media.ts`).

## How the editor frame is drawn

- **The export's own drawing code makes it**, on the server, from the saved
  project (`renderTimelineFrame` in `src/server/video/render.ts`). The saved
  picture is the frame an export would show at that moment. Any edit still
  waiting to save is sent first.
- **The watermark and end card are left out**, because the preview does not
  show them either.
- **Only the clips on screen at that moment are fetched and drawn**, and the
  drawing starts at that moment. A video clip already playing is read from
  where the playhead is, not from its own start, so a frame late in a long
  project does not draw everything before it. Frames took 1 to 4 seconds on a
  Mac in testing, from the button press to the confirmation. Nothing has been
  timed on the Hetzner server yet.
- **The moment is rounded to the nearest 30th of a second**, the step the
  preview moves in. With the playhead parked at the very end, the last frame
  is saved, not a black one.
- **The start is handed to ffmpeg as a whole number of frames.** ffmpeg drops
  the fraction of a start time, and a time like 4.1s written as a decimal can
  sit a hair under its frame. In a 30-minute project, 178 of the 54,000
  frames would have come out one frame early.

## Where the editor picture and the preview can differ

- **Two pieces of one file sliding or fading into each other.** The preview
  plays every clip of one file through a single video player, so during that
  blend it shows one piece only (`frame.videos` in
  `src/components/video-editor/editor-preview.tsx`). The saved picture and the
  export both show the blend. Seen on the Talking sample project at 2.6s.
- **Colour.** The preview's brightness, contrast and saturation match the
  export to within a few levels (see `clip-colour.md`), and the saved picture
  follows the export.

## When it refuses

- **A clip's file has been deleted:** "A clip's file is no longer in the
  library", the same refusal an export gives. The frame is not saved.
- **An empty project:** "There is nothing to export yet".
- **Edits that did not save:** "The latest edits are not saved, so the frame
  cannot be drawn yet". This covers a failed save and a project changed in
  another tab.
- **Anything else going wrong in the drawing:** "That moment could not be
  turned into a picture". The real reason goes to the server log.
- **An export that is not finished:** the button only appears on a finished
  export, and the server refuses any other.
- **One picture at a time per person:** a second save started while the first
  is still running, from another tab say, gets "A picture is already being
  saved. Try again once it has finished." Each save downloads the video files
  it needs and runs ffmpeg while you wait, the same reason jump cuts run one
  at a time.
