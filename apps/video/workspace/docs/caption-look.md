# Caption look

How captions look when they land: their font, size, colour, outline, box,
entrance, how many words show at once, and where they sit. The look is saved
once for the whole app on Settings, Captions, and every window that writes
captions starts from it.

## Where it is set

- **Settings, App settings, Captions** (`/admin/settings/captions`), "How
  captions look". It saves itself as it changes, with no button: a switch or
  a pick saves at once, a slider or colour 700ms after it stops moving. The
  page header says Saving…, Saved or Not saved.
- **Who may change it:** admins, because it changes captions for everybody.
  Anyone signed in may read it, since every caption window needs it.
- **Where it is kept:** `video_settings.caption_look` (`drizzle/0140`). Until
  somebody saves one, the standard look applies.

The brand kit that held a saved look until 13 Oct 2026 is gone. Tyler chose
Settings as its new home on 21 Oct 2026.

## What the look is

- **Font:** one of the five text faces ([text-fonts.md](text-fonts.md)).
- **Size**, **colour**, and **all in capitals**, which writes the words in
  capitals as the captions are laid.
- **An outline round the letters:** its colour and thickness, 1 to 12 pixels
  in the 1080-tall frame. Off is a thickness of 0.
- **A box behind the words**, and its colour.
- **How they arrive:** None, Pop, Rise or Bounce.
- **Light up each word as it is said**, and the colour it lights up in
  ([word-by-word-captions.md](word-by-word-captions.md)).
- **Words at a time:** 1 to 4. Four is what captions were always cut at.
  Fewer cuts each line again at its word times, into pieces as even as they
  come, so four words at three a line are two and two. A line without word
  times (a translation laid at the original's times) keeps its length. Lines
  are only cut smaller while one lane can still hold them all: a lane takes
  500 clips, and one word at a time on a talk of a little over three
  minutes would pass that and stop the project saving, so a talk that long
  keeps its four-word lines.
- **How far down** the middle of the words sits.
- **Keep clear of:** TikTok, Instagram Reels, YouTube Shorts or no platform
  ([safe-box.md](safe-box.md)).

A look saved before a field existed reads that field from the standard look,
so a look with no font reads as Inter. A saved field that no longer reads,
such as a font that has since gone, is taken from the standard look too, field
by field, so one stale field never stops projects from opening or the
Captions tab from loading. The safe boxes read the same way, one platform at a
time.

## The standard look and the presets

The Preset pick at the top fills in every field at once. Each field can still
be changed after, and the pick then says "Your own, changed from a preset". A
colour that draws nothing, such as the outline's colour with the outline off,
does not count as a change. A
preset never changes the platform, because that is about where the video is
going rather than how it looks. The presets are in
`src/lib/video/caption-presets.ts`.

| Preset | What it is |
| --- | --- |
| Plain | The standard look: white 64 px Inter on a black box, 78% of the way down, no outline, no entrance, four words at a time |
| Karaoke | White 76 px Inter with a 3 px black outline and no box, three words at a time, each lit up yellow as it is said, 72% down |
| Bold | White 96 px Anton in capitals with a 5 px yellow outline and no box, popping in, 72% down |

Plain is the standard look field for field, and a test holds it to the values
written out by hand.

## Which captions use it

- **The Captions tool** in the AI tools panel. Its window opens on the saved
  look every time, with every setting there to change and a sample beside
  them. A change there is for that one run.
- **The Voice tool.** Its captions take the saved look. The window offers the
  entrance only.
- **A saved voiceover** laid from the Voices panel, **a translation** from the
  Another language tool, and **Brief to video's scenes** take the saved look as
  it is. Brief to video's worker reads it from the database when it lays
  scenes with nobody editing.
- **A guest sent from Project** has no AI tools, so nothing lays captions for
  them.

Every one of these goes through `captionTextClips` in
`src/lib/video/caption-look.ts`, so they all land alike.

**Make it again** on a voice line keeps the replaced captions' own look and
place, and takes only the saved look's words at a time and capitals, because
those are about how the words are cut and written rather than how they look.

## Why it only touches new captions

- **A caption stores its own look.** Every caption clip on a timeline carries
  its own font, size, colour, outline, box, entrance and place.
- **Restyling old projects would undo hand edits.** Someone may have moved one
  caption off a face, or recoloured one line. Reaching back into every project
  would throw that work away without asking.
- **An export would change without anyone opening the project.** A video made
  last month should come out the same if it is made again.

To restyle captions already on a project, select them and change them in the
inspector. The inspector's "The words" card has the font and an Outline switch
with its colour and thickness.

## How the sample, the preview and the export match

The sample in the window and on Settings uses the editor preview's drawing
rules (`src/components/video-editor/editor-preview.tsx`). The words are
anchored at their middle, and the size is scaled from the 1080-pixel-tall frame
the app measures all text in. The entrance plays with the numbers in
`src/lib/video/caption-animations.ts`, which the export also uses.

- **Where a line wraps:** at 90% of the frame's width, or the safe box's width
  when a platform is picked. The preview wraps where the browser wraps. The
  export, from 22 Oct 2026, measures each line in the real font file the way
  the carousel export does (`src/server/video/text-measure.ts`), so it breaks
  where the browser breaks. Until then it guessed from an average letter width,
  and a line that only just fit could break one word earlier.
- **A box behind the words** takes 0.45 of the size from each side of that
  width, in the preview (its padding) and, from 22 Oct 2026, in the export too.
  Before, the export let boxed words run that much wider than the preview did.
- **The outline** is drawn twice as thick as asked and under the letters, in
  both the preview (`paint-order`) and the export, so the thickness shows
  outside each letter and none of the letter is lost. Both use sharp corners.
- **Up and down:** the export puts each line's baseline where a browser does,
  from each face's own reach above and below the line. Until 22 Oct 2026 it
  used Inter's numbers for every face, which drew Anton 11 pixels too high on a
  1080 by 1920 frame.

Measured on 22 Oct 2026 against Chromium drawing the same caption with the
preview's styles, on a 1080 by 1920 frame, by the outer edge of the lit
pixels:

| Look | Left and right | Top and bottom |
| --- | --- | --- |
| Bold, inside TikTok's box, three lines | Same pixel | Same top, bottom 1 pixel lower |
| Karaoke, two lines | Within 1 pixel | 2 pixels lower, then 1 |
| Plain, inside Reels' box, two lines | Within 1 pixel | 3 pixels lower, then 1 |

The 1 to 3 pixels are on a 1920-pixel frame; on an editor stage about 800
pixels tall that is under a pixel. They were measured against a copy of the
preview's styles, not the editor itself, because no dev server was running.

The sample is always the tall 9:16 shape, because most captioned video is made
for phones. On a wide project the same caption takes up less of the width, and
in the Captions window the sample shows no platform box and leaves the words
where they always sit, because the box only applies to tall projects.
