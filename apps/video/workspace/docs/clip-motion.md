# A slow move on a still picture

A photo held on screen for four seconds with nothing moving looks like the
player has frozen. A picture clip can instead make one slow move across its
time on screen. The choice is in the inspector on the right, under
**Movement**, on picture clips only. Video already moves, and sound and text
have no picture to move, so none of them gets the choice.

## The moves

There are five choices, and **Still** is the default.

- **Still.** The picture sits where it is for the whole clip. This is what
  every picture did before this setting existed.
- **Push in.** The picture starts at its normal size and grows to 1.1 times
  that size by the end of the clip, growing out from the middle. It reads as
  the camera leaning in.
- **Pull out.** The same move backwards. The picture starts at 1.1 times its
  size and shrinks back to normal by the end.
- **Drift left.** The picture is drawn at 1.1 times its size the whole time
  and slides to the left. It starts 4% of the frame's width right of centre and
  ends 4% left of it. In a 1080-wide reel that is 86 pixels of travel.
- **Drift right.** The same slide the other way.

Every move runs at an even speed from the first frame of the clip to the last.
Nothing speeds up or slows down, so a longer clip moves more slowly and a short
one faster. A four second push in grows 0.025 times its size each second.

The drifts are drawn at 1.1 times the picture's size, which leaves 5% of the
frame's width spare on each side. The slide only uses 4% of that, so the edge
of the picture never comes into view. No move ever goes below normal size, for
the same reason.

## How it works with the other settings

- **Fit inside or fill the frame.** The move is applied to the whole frame, so
  a picture fitted inside the frame moves together with its black bars. A
  filled picture has no bars, so the move shows no black anywhere.
- **Coming in.** A crossfade or a slide into a moving picture holds the
  picture's first position while it blends in. The move starts at the seam,
  when the clip itself starts.
- **Replace media.** A picture replaced with a video loses its move. A picture
  replaced with another picture keeps it.
- **Split.** Both halves of a split picture keep the move, and each half makes
  the whole move over its own length. A push in split in the middle grows to
  1.1 times, jumps back to normal size at the cut, and grows again. Set the
  second half to **Still**, or to another move, to avoid that jump.

## Still is what an absent value means

A clip with nothing saved holds still. Every project saved before this setting
existed has no value on any clip, and those projects keep their look.
Choosing **Still** removes the value rather than saving a word for it, so an
old project and a new one are the same file. A saved value that is not one of
the four moves fails the whole timeline rather than being quietly corrected.

## Where it lives

`src/lib/video/clip-motion.ts` holds the four moves as a start and an end
position, the reader that turns an absent value into still, and both the
preview's CSS and the export's ffmpeg filter. Nothing else decides anything.

- `src/lib/video/timeline-schema.ts` takes the allowed names from that file, as
  an optional `motion` on a clip.
- `src/components/video-editor/editor-preview.tsx` works out the position for
  the current moment on every tick of the playback clock and writes it to the
  picture as a CSS transform.
- `src/server/video/render.ts` adds the move to a picture's ffmpeg chain,
  straight after it is fitted to the frame. The export uses ffmpeg's
  `perspective` filter rather than `zoompan`, because `zoompan` places the
  picture to whole pixels. A slow zoom built from whole pixels visibly shakes.
  `perspective` places it to a fraction of a pixel.
- A moving picture is read into ffmpeg at the film's 30 frames a second rather
  than ffmpeg's usual 25 for a picture. At 25, the move would step on some
  frames of the film and hold still on others.

## How smooth the export is

A four second drift in a 1080x1920 reel was rendered and measured before
compression. It moved 85.6 of the expected 85.7 pixels. Each frame moved it
between 0.66 and 0.78 pixels, against an even 0.72. A push in never strayed
more than two thirds of a pixel from its exact path at the frame's edge.
