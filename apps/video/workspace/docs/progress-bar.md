# The progress bar

A thin bar along one edge of the video that fills from left to right as it
plays, so a viewer can see how much is left.

## Turning it on

- **From the Text panel:** the **Progress bar** button under Shapes switches
  it on and clears the picked clip, so its settings show on the right.
- **From the right-hand panel:** with no clip picked, the **Progress bar** card
  has a switch, and the bar's settings once it is on.
- **One per project:** a second press of the Text panel button says the
  project already has one.

## What you can set

- **Edge:** Bottom or Top.
- **Colour:** any colour. White to start.
- **Thickness:** 2 to 40 pixels, 8 to start. Pixels are counted on a frame
  whose short side is 1080, which every shape of project has at full quality,
  so 8 is 8 real pixels on a tall 1080 by 1920 video and on a wide one. A lower
  export quality shrinks it with the frame.

## Where it sits

A new bar sits on the inner edge of the safe box: the strip the platform picked
on Settings → Captions covers at the bottom of a tall video (see
[safe-box.md](safe-box.md)). With no platform picked, or a project that is not
tall, it sits on the very edge.

That distance is saved on the bar. Changing the safe box later moves where new
bars start and never moves one that is already there. Moving the bar to the
other edge works its distance out again from that edge's strip.

## How full it is

The bar is measured against the whole video, from the first frame to the end
of the last clip: halfway through a 30 second video it covers half the width.
It always runs the whole length, however the clips move, which is why it
belongs to the project and is not a clip on a lane.

## How it is stored and drawn

- **Saved:** as `progressBar` on the project's timeline, beside its shape:
  `edge`, `color`, `thickness` and `inset` (`src/lib/video/progress-bar.ts`).
  A project with no bar has no such field, so every project before this
  reads the same. Like the shape, switching it on or off is not part of Undo.
  It is part of a saved version, so two versions that differ only by the bar
  are kept as two, and restoring one brings its bar back.
- **Preview:** a strip whose width the playback loop sets once a frame.
- **Export:** a strip of the colour as wide as the frame, slid in from the
  left by ffmpeg's `overlay` so its right end is where the video has got to.
  It is drawn last, over everything, so it stays on through a dip to black.
- **Checked against a real export:** a 40-pixel white bar on a 2 second video
  was white along the left half of the bottom edge one second in, and grey
  along the right half.
- **Checked in the browser:** on a tall stage 467 pixels high the bar was
  1.94 pixels thick at the bottom edge, and after a second of play it was
  11% full on a 6.6 second project.
