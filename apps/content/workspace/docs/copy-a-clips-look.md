# Copy a clip's look

Right-click a clip and pick Copy look. Then right-click another clip and pick
Paste look. Tyler, 4 Nov 2026, picked what travels: colour and film look,
fades, size, crop and fit, speed and volume.

## Pasting onto several clips

- **Pick them first.** Shift-click or Cmd-click the clips to paste onto, then
  right-click one of them and pick Paste look. Every picked clip takes the
  look.
- **One clip.** Right-clicking a clip that isn't picked pastes onto that clip
  alone.
- **One Undo step.** A paste onto five clips is undone with one Cmd+Z.
- **The copied look stays** until another Copy look, so it can be pasted
  again and again. It isn't saved, so a reload empties it.

## What travels

| Setting | Video | Picture | Sound |
| --- | --- | --- | --- |
| Brightness, contrast, saturation, film look | yes | yes | no |
| Picture fades in and out | yes | yes | no |
| Fit or fill, crop spot, Size slider | yes | yes | no |
| Sound fades in and out | yes | no | yes |
| Volume | yes | no | yes |
| Speed | yes | no | yes |

- **Every setting is written out.** A setting left at normal on the copied
  clip puts the other clip back to normal too, so the two end up looking the
  same.
- **Text and shapes** have none of these, so their menu has no Copy look or
  Paste look.

## What never travels

The file, the words, where the clip sits on the timeline, where it sits on the
frame (x and y), its zooms, blur and follow points. The code is
`src/lib/video/copied-look.ts`, and the paste is `PASTE_LOOK` in
`editor-store.ts`.

## Speed changes the clip's length

A pasted speed resizes the clip by the same rule the Speed slider uses
([clip-volume-and-speed.md](clip-volume-and-speed.md)). The clip keeps showing
the same stretch of recording, so a faster clip gets shorter. A slower clip
stops at the next clip on its lane, so it may show less of the recording. An
ad never takes a pasted speed, because its length moves the video after it.
