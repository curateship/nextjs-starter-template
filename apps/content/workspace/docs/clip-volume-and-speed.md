# Clip volume and speed

A video or sound clip has two settings of its own beyond mute: how loud it
plays, and how fast. Both live in the inspector on the right, under Sound and
under Speed. A picture and a text clip have neither, because there is nothing
to turn down and nothing moving to speed up.

## Volume

Volume runs from 0 to 1 and is shown out of 100, so 20% is a fifth of the
volume the file was recorded at. A clip with no volume saved plays at 100%,
which is how every clip made before this setting existed reads.

Volume is not the mute switch. Mute silences the clip outright and stays where
it was; volume scales what is left. A clip that is muted and set to 60% plays
nothing, and plays at 60% the moment the mute is switched off.

**Full is as loud as it goes, and that is deliberate.** The browser's own
player cannot play a file louder than it was recorded, and the footage in the
preview comes from the storage bucket on a different web address, which rules
out the second audio system that could. A slider that offered more would be
silently wrong in the preview and right only after an export, so it stops where
the preview and the export agree. Making one clip stand out means turning the
others down. Raising the cap later is a change to two numbers in
`src/lib/video/clip-playback.ts` plus real audio plumbing in the preview.

A clip set to 0 counts as silence everywhere, not just in the mix. It no longer
counts as a voice for "duck under voice", and it no longer gets ducked itself.

## Speed

Speed runs from 0.25 to 4, shown as a multiplier. 2x plays the clip twice as
fast, 0.5x half as fast. Absent means 1x.

**Changing the speed changes how much timeline the clip takes, not what it
shows.** The clip keeps pointing at exactly the same stretch of the recording.
An 8 second take set to 2x becomes 4 seconds of timeline holding the same 8
seconds of footage. Set to 0.5x it becomes 16 seconds.

One exception. Slowing a clip down can run it into whatever comes next on its
lane, and clips never overlap, so it takes the room up to that clip and no
more. A slowed clip that hits a neighbour therefore shows less of its recording
than it did, and the Speed card prints both numbers side by side: how much
footage is used, and how much room it takes.

Sound keeps its pitch. Both the preview and the export hold the voice where it
was rather than letting it rise with the speed.

A clip that hits a neighbour while being slowed down has really been trimmed,
so dragging the slider back up does not bring that footage back. Undo does. A
whole drag of either slider is one undo step, because only the first value of a
drag is remembered: that is the moment the clip still held what it started
with.

## How the two settings reach the export

The preview and the export are built from the same clip, and both were changed
together so they agree.

In the preview, `src/components/video-editor/editor-preview.tsx` sets
`element.volume` and `element.playbackRate` on each clip's `<video>` or
`<audio>` every frame. Ducking multiplies into the volume rather than replacing
it, so a ducked clip at 40% ducks from 40%.

In the export, `src/server/video/render.ts` builds one ffmpeg input per clip.
Speed changes both halves of it:

- The input is trimmed to the recording the clip eats, which is its own length
  times its speed, rather than to its length on the timeline.
- The picture is squeezed or stretched back into the clip's room with
  `setpts`, and the sound with `atempo`. `atempo` only accepts 0.5 to 2, so
  0.25x and 4x are two stages multiplied together. `atempoFilters` in
  `src/lib/video/clip-playback.ts` builds the chain.
- The clip's own volume is applied before the delay that puts the sound in
  place, and the ducking curve after it, because the curve is written against
  timeline time.

## Why speed touches so much of the app

Speed breaks the assumption that one millisecond of clip is one millisecond of
recording. Everything that turns "this far into the clip" into "this far into
the file" goes through `src/lib/video/clip-playback.ts`, which owns the two
conversions and nothing else:

- `sourceMsAt(clip, offset)` walks into the file at the clip's speed.
- `clipMsAt(clip, sourceMs)` walks back out.
- `sourceSpanMs(clip)` is how much recording the clip uses up.

The callers are the places that would otherwise land on the wrong moment:
splitting a clip and applying jump cuts in
`src/components/video-editor/editor-store.ts`, dragging either trim grip and
drawing the filmstrip in `src/components/video-editor/studio-timeline.tsx`,
seeking the preview, placing captions in `src/lib/video/captions.ts`, and
finding which clip a transcribed word now lives in
`src/lib/video/transcript-editing.ts`.

The sound sent away to be transcribed is a special case. `src/server/video/
jump-cuts.ts` extracts the whole stretch of recording the clip uses, so the
times that come back are the recording's own. They are divided by the speed
once, where the answer arrives, and everything downstream works in the clip's
own milliseconds. The ten-minute cap on what jump cuts will listen to is
measured against that recording too, not against the room the clip takes, so a
clip at 4x cannot slip four times as much sound past it.

## Trimming now stops at the ends of the file

Dragging the left grip walks backwards into the file, and at 2x every
millisecond of timeline costs two of recording, so the edge stops twice as
soon. Dragging the right grip stops where the file runs out. Neither edge could
run past the file before this change either, but at speeds other than 1x it
would have happened on an ordinary drag rather than only at the extremes.
