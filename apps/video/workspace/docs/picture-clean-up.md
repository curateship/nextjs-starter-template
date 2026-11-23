# Cleaning up a picture with AI

AI can take a glass reflection or an object off a picture clip, and the clean
picture takes the old one's place on the timeline. Tyler asked for this on
3 Nov 2026 for pictures only ("Pictures only for now"), so a moving video clip
has no clean-up yet.

## Two ways in

- **Remove reflection…** on a picture clip's right-click menu. It is for a
  photo taken through a window: the room, lamps and glare mirrored on the
  glass come off, and the view behind it stays.
- **Remove an object…** on the same menu. A box asks "What should go?", for
  words such as "the cup on the table" or "the logo on the shirt".
- **On the Thumbnail board** the same two changes sit on a picture layer
  ([thumbnails.md](thumbnails.md)).
- **Who gets them:** they use AI, so a guest sent from Project doesn't see
  them on the timeline ([project-guests.md](project-guests.md)). The History
  preview has no menu at all.

## The window

- **The model:** Nano Banana 2 to start with, about 7¢ a picture, with Nano
  Banana and GPT Image 2 in the dropdown. The price is on the button, such as
  "Remove reflection · $0.07".
- **What is sent:** the picture itself and one fixed request for the kind of
  change. Every request ends by asking for nothing else to change: the same
  faces, framing, colours and text. The models otherwise like to "improve" a
  face. The requests are in `pictureEditPrompt`
  (`src/lib/video/picture-edits.ts`).
- **The shape:** the new picture is asked for in the nearest shape the model
  can make to the old one's, out of 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16,
  16:9 and 21:9 (`nearestImageAspect`).

## What happens after

- **The swap:** the new picture takes the clip's place with the same start,
  length, lane, fit, colour and slow move. One Undo brings the old picture
  back.
- **The old picture stays:** both are in the media library and on the
  project's media shelf. The new one is named after the old, such as "Window
  shot without reflection" or "Window shot without the cup".
- **Make it again:** a changed picture loses its Make it again recipe, because
  making it again from the old words would bring the reflection back.
- **Spend:** the call counts on the video's spend line under "Pictures", and
  the video's spend limit can refuse it before anything is sent.

## The before and after slider

Straight after a change, the preview shows the old picture on the left of a
white line and the new one on the right. Drag the line, or pick it and use the
arrow keys, to compare. **Done** puts it away, and so does picking another
clip. It doesn't change anything: Undo is what brings the old picture back.

## Where it lives in the code

- `src/server/video/picture-edits.ts`: `editPicture` (one change, kept in the
  library and on the shelf), `cleanUpOwnedPicture` (the timeline's way in) and
  `keyOutGreen` (the Thumbnail board's cut-out).
- `src/lib/api/video/picture-edits.ts`: the endpoint. A guest is refused, and
  the picture must be in the caller's own library.
- `src/components/video-editor/picture-clean-up-dialog.tsx`: the window.
- `src/components/video-editor/before-after-slider.tsx`: the slider.
- **Tested** with the model stood in for (`picture-edits.test.ts`): the
  picture goes in its own shape, the new one is kept on the shelf, a picture
  from another library is refused before anything is sent, and an object
  needs words. No real picture model has been called yet, because the local
  keys spend real money.
