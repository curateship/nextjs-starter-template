# Stickers

The Stickers row in the studio's Text panel is each person's own list. It holds
emoji and pictures from their media library. One press on a sticker puts it on
the frame at the playhead.

## The list

- **Somebody who has never changed it** sees the eight that have always been
  there: 🔥 ✨ 👀 ☕ 💯 ➡️ ❤️ ⭐. Nothing is stored for them until they add or
  remove one.
- **Adding an emoji:** type or paste one emoji into "Add an emoji" and press
  Add. On a Mac, Control-Command-Space opens the emoji picker in that field.
  Flags, skin tones and family emoji all count as one. Two emoji, a word or a
  plain digit are refused, and the field keeps what was typed.
- **Adding a picture:** "Add a picture" opens every picture in your library,
  not only the ones on this project's shelf. A logo is uploaded once and then
  used in every project. The window shows your newest 60. With more than that
  it says so, and the search box finds the older ones.
- **Removing one:** hover a sticker, or tab to it, and press the small cross.
  This works on the built-in eight too. Once one of them is removed it stays
  removed.
- **Order:** the list keeps the order stickers were added, with new ones at
  the end.
- **Limits:** 60 stickers, and each one only once. A second 🔥 is refused with
  "That sticker is already in your list."

## Where a sticker is stored

- **One row per person** in `video_sticker_lists`, created by
  `drizzle/0082_video_sticker_lists.sql`. The row holds the whole list as JSON,
  in order. Deleting the person deletes the row.
- **An emoji is stored as the emoji.** A bare ❤ typed without the colour
  marker is saved as ❤️, so the two are one sticker.
- **A picture is stored as its media id only.** The file stays where it
  always was, in the media library. Taking the sticker off the list leaves the
  file alone.
- **Two tabs at once:** every add or remove locks the person's row first and
  writes it before reading, so two tabs saving at the same moment both land.
- **Only your own pictures.** The server checks that a picture is yours and is
  a picture when you add it, and again every time the list is read.
- **The code:** the list rules are in `src/lib/video/stickers.ts`, the reads
  and writes in `src/server/video/stickers.ts`, and the panel in
  `src/components/video-editor/studio-stickers.tsx`.

## What lands on the frame

- **An emoji** becomes an ordinary text clip, exactly as the built-in ones
  always have: size 90, white, in the middle of the frame, three seconds long.
  An emoji you added arrives the same size as a built-in one. It can be
  dragged, resized and recoloured like any text.
- **A picture** becomes an ordinary picture clip, three seconds long, at 30% of
  the frame's size, in the middle. On a tall 9:16 project a square logo arrives
  324 pixels across out of 1080. It can be dragged on the preview, and resized
  with the Size slider under **The frame** (see
  [clip-frame-fit.md](clip-frame-fit.md)).
- **Where on the timeline:** the top lane that has room at the playhead, as
  long as no video or picture on a lane above would cover it. When there is no
  such lane, a new one is added at the top. The Text panel's Big Title, Bold
  Caption and Subtitle land the same way. Before this, all of them could land
  on a new lane at the bottom, underneath the footage, and be hidden behind it.

## When a picture sticker's file is deleted

- **The list:** the sticker drops off the next time the list loads. Nothing
  else has to happen.
- **Projects already using it:** a placed sticker is an ordinary picture clip,
  so it behaves like any picture whose file has gone. The clip stays on the
  timeline and shows a broken picture in the preview. It is not removed
  silently. You can see it and either replace the file or delete the clip.
- **Exporting that project** stops with "A clip's file is no longer in the
  library" until the clip is fixed or deleted. That message comes from
  `src/server/video/render.ts`.

## Known limits

- **Emoji do not export yet.** The export draws text with one font, Inter
  (`src/server/assets/Inter-SemiBold.ttf`), and Inter has no emoji. Every
  emoji sticker, built-in ones included, comes out of an export as a white
  "NO GLYPH" box. The preview looks right because the browser uses the
  computer's own emoji. Fixing it means adding an emoji font to the export
  server, which has not been decided.
- **The play button covers the middle of the preview.** While paused, a 60px
  play button sits over the centre of the frame, which is exactly where a new
  sticker lands. The sticker is there, blurred underneath the button. Grab it
  by an edge that sticks out, or press play first.
