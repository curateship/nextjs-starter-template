# Copying clips between projects

Clips copied in one project can be pasted into any other project opened on the
same browser. The point is the intro used on every video: build it once, then
paste it in.

## How to use it

- **Pick the clips.** Click one clip on the timeline. Hold Shift (or Cmd) and
  click more to add them to the group. Shift-clicking a picked clip takes it
  back out. The inspector shows the clip clicked last.
- **Copy.** Cmd+C, or the copy button on the timeline's toolbar.
- **Paste.** Open any project, put the playhead where the clips should start,
  and press Cmd+V or the paste button beside copy.

## Where the pasted clips land

- **At the playhead.** The earliest copied clip starts at the playhead, and
  every other clip keeps its distance from that one. Three clips with a
  1-second gap and then a 2-second gap arrive with the same two gaps.
- **On the selected clip's lane.** Clips copied from several lanes keep their
  lanes relative to each other, counting down from that lane. With nothing
  selected they start on the top lane. Lanes are added underneath when the
  group needs more.
- **On new lanes when they would overlap.** If any one clip would land on top
  of an existing clip, the whole group goes onto new lanes at the bottom
  instead. The group is never split up or squeezed to make it fit.
- **Refused when the project is full.** A project holds 50 lanes of up to 500
  clips each. A paste that would pass either says so and changes nothing.
- **One undo.** The whole paste comes back off with a single undo.

## What travels with a copied clip

- **Everything set on the clip.** Trim, length, speed, volume, mute, colour,
  fit, a picture's slow move, and a text clip's words, font, colour and place
  all travel.
- **A blend only with its partner.** A blend belongs to the seam with the clip
  before it. It travels only if that clip was copied too, because otherwise it
  would blend into whatever happens to sit before it on the new lane.
- **The file, by reference.** A clip names its file by id. The paste puts that
  file on the new project's media shelf, so the media panel lists every file
  the project uses. Nothing is uploaded twice.

## What does not travel

- **Lane settings.** Mute and "duck under voice" belong to a lane, not a clip,
  so the lane a clip lands on decides them.
- **A deleted file.** A clip whose file has been deleted since it was copied
  pastes as an empty space. It keeps its place, its length and its name, with
  "(file deleted)" added to the name. A warning message names the file and
  stays until it is closed. The export draws nothing there. Replace media on
  that clip puts footage back.
- **Another browser.** The copy lives in this browser's own storage, so it is
  not offered on a different browser or computer. It survives closing the
  project and reloading the page.
- **Another account.** Signing out does not empty the browser's storage, so
  the copy remembers who made it. Anybody else who signs in on the same
  browser sees nothing to paste, because the words and file names in it are
  not theirs.

## Where it lives in the code

- `src/lib/video/clip-clipboard.ts` makes the copy, stores it and reads it
  back. The stored copy is checked against the saved-timeline rules, so a
  damaged copy counts as an empty clipboard.
- `PASTE_CLIPS` in `src/components/video-editor/editor-store.ts` places the
  group. `selectedClipIds` in the same file is the group selection.
- `attachPastedMediaToProject` in `src/server/video/media-list.ts` shelves the
  files and names the missing ones. It accepts only the signed-in person's own
  project and files.
- `src/components/video-editor/use-clip-clipboard.ts` joins them up for the
  keyboard and the toolbar.
