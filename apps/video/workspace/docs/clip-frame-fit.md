# Fitting a clip to the frame

A project has one shape and a clip has another. A phone recording is tall, a
camera recording is wide, and a reel is usually 9:16. The clip has to give
something up to meet a frame it is not the same shape as, and this setting is
the choice of what. It is in the inspector on the right, under **The frame**,
on video and picture clips only. Sound has no picture and text is drawn at the
size it is written, so neither gets the choice.

## The two choices

**Fit inside** shrinks the picture until the whole of it is inside the frame.
Nothing is lost. The frame is bigger than the picture in one direction, and
what is left over is black. A 1920x1080 recording in a 1080x1920 reel comes out
1080 wide and 608 tall, sitting in the middle with 656 pixels of black above it
and 656 below.

**Fill the frame** grows the picture until it covers the frame in both
directions and cuts off whatever hangs over the edge. No black anywhere. That
same 1920x1080 recording becomes 3413x1920, and the middle 1080 columns are
kept. 1166 pixels are cut from the left and 1167 from the right, so roughly two
thirds of the width of the shot is gone.

The crop is always taken from the middle. There is no way to slide it, so a
subject standing at the far left of a wide shot is cut off by filling. That is
the trade, and it is why the choice is per clip rather than per project.

## Fit is the default, and it stays the default

A clip with nothing saved fits inside. Two reasons.

Every project made before this setting existed has no value on any clip, and
those projects looked the way they looked. Reading an absent value as fit is
what keeps an old export and a new export of the same project identical. The
saved file matches too: choosing **Fit inside** removes the value rather than
writing `"contain"`, so a project saved today and one saved last year are the
same JSON.

The other reason is that fit never destroys anything. Black edges are ugly and
obvious, and someone who does not want them can see them and press one button.
A default that quietly threw away two thirds of every wide shot would be harder
to notice and impossible to undo after the fact.

## Where it lives

`src/lib/video/clip-frame-fit.ts` holds the two values, the reader that turns an
absent or unknown value into `contain`, and the ffmpeg filter. Three places use
it and none of them decides anything for itself.

- `src/lib/video/timeline-schema.ts` takes the allowed values from that file, as
  an optional `fit` on a clip. A saved value that is neither `contain` nor
  `cover` fails the whole timeline rather than being quietly corrected.
- `src/server/video/render.ts:621` builds one ffmpeg stage from it per visual
  clip. Fitting is `scale=W:H:force_original_aspect_ratio=decrease`. Filling is
  `increase` followed by `crop=W:H`.

  The crop looks redundant and is not. `increase` leaves the picture longer
  than the frame on one side, and for a still frame that costs nothing, because
  the overlay that draws it clips the overflow anyway. The slide transition is
  where it shows. The slide moves the picture by an amount measured from the
  picture's own width, so an uncropped 3413-wide picture travels 2246 pixels in
  the time a 1080-wide one travels 1080. Halfway through a slide into a filled
  16:9 clip, the cropped picture covers 540 of the frame's 1080 columns and the
  uncropped one already covers all 1080. The slide arrives early and the blend
  is lost.
- `src/components/video-editor/editor-preview.tsx` sets CSS `object-fit` to the
  same word. A picture clip gets it on its own element. A video gets it written
  once a frame by the playback loop, because clips of the same file share one
  `<video>` element and two clips of that file may be set differently.

The preview and the export use the same rule, so a frame paused on screen and
the same frame in the finished file line up.
