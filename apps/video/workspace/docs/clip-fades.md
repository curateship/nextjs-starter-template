# Fading a clip in and out

Any clip can fade in at its start and fade out at its end, with the sound and
the picture each set on their own. The **Fades** card in the inspector on the
right holds four sliders:

- **Sound fade in** and **Sound fade out**, on video and sound clips.
- **Picture fade in** and **Picture fade out**, on video, picture and text
  clips.

A video clip gets all four. A sound clip has no picture and a text or picture
clip has no sound, so each gets two.

Each slider's first stop is **Off**. The stops after it run from 0.2 to 5
seconds in tenths. One drag of a slider is one undo step, however far it went.
Tyler chose these lengths on 18 Oct 2026: "a slider from 0.2 to 5 seconds, with
sound and picture each getting their own fade-in and fade-out sliders."

## What a fade does

- **Sound** rises evenly from silence to the clip's own volume over the fade
  in, and falls evenly back to silence over the fade out. A clip at 40% volume
  fades up to 40%, not to full.
- **Picture** fades to see-through, not to a colour. On the bottom lane there
  is only black behind it, so it looks like a fade to black. Over another lane
  it shows whatever is underneath, so a picture fading out over a video
  dissolves into that video.
- **Trimming** moves a fade with the edge it belongs to, because a fade is
  always measured from the clip's own start or end.
- **Text** fades the same way as a picture. A caption that also has an
  entrance, such as Pop, does both: the entrance runs and the whole caption is
  faded on top of it.

## Two fades longer than the clip

The fade in and the fade out together can't be longer than the clip. When they
would be, both are shortened by the same share and they meet in the middle. A
3 second fade in and a 3 second fade out on a 4 second clip play as 2 seconds
and 2 seconds. A 4 second fade in and a 2 second fade out on a 3 second clip
play as 2 and 1.

The card says so when it happens, for example "This clip runs 4.0s, so the two
sound fades play as 2.0s and 2.0s." What is saved is still what the sliders
say. Trimming the clip longer again brings the full fades back, the same way a
lone fade longer than its clip has always been cut to the clip's length and
grown back.

## A picture fade beside a transition

**A transition wins over a picture fade at the same seam.** A clip that blends
in from the clip before it, with a crossfade, a dip to black or a slide, skips
its own picture fade in. A clip that the next clip blends in over skips its
picture fade out. The far end of each clip still fades.

The reason is what the two together look like. A crossfade draws the incoming
clip over the outgoing one and brings it up while the outgoing one stays
solid underneath. If both clips were also fading to see-through, the middle of
the crossfade would have both of them half see-through at once, and the lane
underneath, or black, would show through: a dip nobody asked for. A
transition is set on one seam on purpose, so it gets that seam.

The card says when this happens, under the slider it affects: "The slide into
the next clip is used at the end instead of this fade." The slider keeps its
value, so taking the transition off brings the fade back. Sound has no
transitions, so sound fades always play.

## Splitting a faded clip

Splitting keeps the fades in on the left half and the fades out on the right
half. The new edge between the halves is the middle of the footage, and a fade
there would be a dip in the sound or a flash of black. Undo puts the one clip
back with all four fades.

The same rule covers the other places a clip is cut into pieces. Tighten,
which cuts the pauses out of a take, fades only the first piece in and the
last piece out. The Hook window's "quieten" choice, which cuts the opening line
off a talking clip, keeps the fades in on the opening and the fades out on the
rest.

## Projects saved before this

The sound fade out is saved as `fadeOutMs`, the name the music fade had before
the other three existed. A project saved with the old "Fade out at the end"
switch therefore opens with Sound fade out at 2.0s and plays exactly as it did.
Music laid under a project still arrives with a 2 second fade out on its last
piece (see `background-music.md`).

The other three are `fadeInMs`, `pictureFadeInMs` and `pictureFadeOutMs`. A
clip without them has no fade. The timeline refuses a value outside 0.2 to 5
seconds for these three. `fadeOutMs` keeps the wider check it was always saved
under, so no older project stops opening.

## The preview and the export agree

Both read the fades through `src/lib/video/clip-fades.ts`, which holds the
limits, the shortening, the transition rule and the split rule, so the two
can't drift apart. Both ramp in a straight line, which is what ffmpeg draws by
default.

- **The export** (`src/server/video/render.ts`) fades sound with ffmpeg's
  `afade` on the clip before it is moved into place. A picture or a text layer
  gets an alpha channel and ffmpeg's `fade` with `alpha=1`, which takes the
  layer from see-through to solid, before it is laid over the lanes below.
- **Text is a special case in the export.** Words are drawn as still pictures
  and the export holds each picture for as long as it is on screen, as one
  frame repeated. A fade has to change every frame, so a text clip with a
  picture fade is given one frame per frame of the film first. It also becomes
  a layer of its own instead of sharing one with the captions around it, so
  its fade can't reach them.
- **The preview** (`src/components/video-editor/editor-preview.tsx`) sets the
  clip's opacity, and multiplies the sound fade into the volume it already
  sets for the clip's own level and for ducking.

### What was measured

A real export of a 4 second white clip with a steady tone, set to a 3 second
sound fade in and a 1 second picture fade in and out, through the export's own
code and ffmpeg (`src/server/video/render-fades.test.ts`):

- The first frame is black. Half a second in the picture is half way up, and
  half a second before the end it is half way down.
- The sound is silent at the start, half its full level at 1.5 seconds and
  full by 3 seconds.
- Words faded in over a second are half way up at half a second. Words faded
  out over half a second are on their way down a quarter of a second before
  they go, and nearly gone just before.
- A white still picture faded in and out over a second each is black at its
  first frame, half way at half a second in and half a second from its end,
  and full in its middle.
- Two white clips joined by a 1 second crossfade, both set to fade in and out,
  stay white across the whole seam and still fade at their far ends.

The same settings on a real project in the editor at `localhost:3016` gave the
same numbers in the preview: the picture at 25% and 50% a quarter and half a
second in, and the sound at a twelfth, a sixth, a half and five sixths of full
at 0.25, 0.5, 1.5 and 2.5 seconds.
