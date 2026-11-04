# The Thumbnail section

The editor's rail has a Thumbnail section, after AI clip, for designing a
video's YouTube thumbnail or its Shorts cover, by hand or with AI. Tyler asked
for it on 3 Nov 2026: "this panel is for designing thumbnail using Ai". The
task and his answers are in
`workspace/tasks/thumbnail/01-thumbnail-and-blur-features.md`.

## Where things are

- **The left panel** lists the open video's thumbnails and holds the AI
  tools, the title, other languages and the download.
- **The ⋮ beside the + in its header** opens the settings menu, the same
  folding menu every app uses ([docs/shell/folding-menu.md](../../../../docs/shell/folding-menu.md)).
  Its rows are How many to make, Picture model, Check it (with an open
  thumbnail), Templates and Copy a style. Each row shows what it holds now on
  the right and folds open in place. Tyler asked for this on 3 Nov 2026,
  pointing at Travel's activity menu. It opens to the right, over the board,
  because the panel is on the left.
- **The board** sits in the middle while the section is open, as big as fits
  across and down. Under it the preview shrinks to a strip 224 pixels tall
  with its play bar, so a frame is found by playing or dragging the playhead,
  and "This frame" takes the frame under the playhead (Tyler, 3 Nov 2026:
  "Shoudlnt there be a way to play the video in the timeline so I can select a
  frame?"). The preview keeps playing as the section opens and closes.
- **The right panel** shows the picked layer's settings, or the board's
  background colour when no layer is picked.
- **Everything saves itself** 0.7 seconds after the last change. The panel's
  header says "Saving…" or "Not saved". A save made from an older copy, such
  as one from a second window, is refused with a reload message.

## Shapes

- **Wide:** 1280 × 720, for YouTube.
- **Tall:** 1080 × 1920, for a Shorts, TikTok or Reels cover.
- **The + in the panel's header** makes a new one: from the frame under the
  playhead in either shape, blank in either shape, or from a template.

## Versions and the main one

- **Every thumbnail made for a video stays** in the Versions card, newest
  first, two to a row. Each tile's picture is as wide as the tile, whatever
  width the panel is dragged to. Clicking one opens it on the board. The trash can deletes one after a
  confirm. The paper plane sends that version to Promo as a picture, drawn
  fresh as a JPEG, starred or not ([send-to-promo.md](send-to-promo.md)).
  A guest sent from Project has no paper plane.
- **The star marks the main one**, one wide and one tall per video at most.
  Starring another takes the star off the old one.
- **The main wide thumbnail is the video's picture** in the Videos tab and on
  the projects list, in place of the first clip's frame
  ([project-thumbnails.md](project-thumbnails.md)). Taking the star off brings
  the frame back.
- **Only main thumbnails keep a finished picture in the media library**, one
  per shape, so drafts never fill it. The library picture is drawn again 2
  seconds after the main one stops changing, and when the star moves to
  another version it takes the same library row. Unstarring removes the
  picture from the library and the project's shelf, unless something else
  uses it, such as a timeline clip or a carousel slide.
- **Pictures the AI makes for the board do go into the library**, like every
  picture the AI makes in Video, because a layer can only show a library
  picture in the download. That is the frames, cut-outs and AI changes. The
  finished thumbnail itself only goes in when it is main.

## Layers

The board's layers are the carousel's own (words, pictures and shades,
[carousel-layers.md](carousel-layers.md)) plus the board's own kinds. The
right panel's Layer card moves a layer forward or back and deletes it.
Backspace or Delete deletes the picked layer, and Escape lets go of it,
unless you are typing in a box. While the Thumbnail section is open those
keys never delete a clip on the timeline.

- **Moving and resizing:** drag a layer on the board, and drag its corner dot
  to resize it.
- **Adding:** the Add card has This frame, Picture (an upload), Words, Arrow,
  Circle and Sticker. Picture files dropped on the board are uploaded and
  added.
- **Stickers:** your own sticker pictures, and any emoji. An emoji is drawn
  by the browser's own emoji font onto a 512-pixel square and kept in the
  library as a picture. The download's drawing has no colour emoji font
  ([stickers.md](stickers.md) says why), so a picture is the only way an emoji
  comes out the way it looks on the board.
- **Arrows and circles** are drawn inside their own box with the same sums as
  the editor's shapes ([shapes.md](shapes.md)). An arrow can point right or
  left.
- **Spots:** a template leaves an empty spot where a picture was. Starting
  from the template fills every spot with the frame under the playhead.

## Text looks (Styles)

Four ready-made looks on a words layer. Pressing one again takes it off.

- **Thick outline:** white letters with a 12-pixel black outline.
- **One word in yellow:** the last word in yellow (#ffd60a), with its own
  colour field. It is a new mark on the carousel's words, "accent", that only
  the board makes. A carousel's own buttons still offer bold and highlight
  only.
- **Drop shadow:** a soft black shadow under the words.
- **Box behind:** white words on a black box.

## Picture looks

- **Colour:** brightness (-50 to +50), contrast (50% to 200%) and saturation
  (0% to 200%), the same ranges and sums as a clip's
  ([clip-colour.md](clip-colour.md)).
- **Outline:** a coloured line round a cut-out's edge, 0 to 40 pixels.
- **Glow:** a soft coloured glow round it.
- **How they are drawn:** one SVG filter, `layerEffectFilter` in
  `src/lib/video/thumbnails.ts`, used by the board through CSS and by the
  download inside the SVG. An outline is the picture's see-through edge
  blurred and made solid again. The usual "grow the shape" filter took 17
  seconds for one 20-pixel outline in resvg; this way took well under one.

## AI pictures

- **How many to make:** 1, 2 or 4, starting on 4 (Tyler, 3 Nov 2026), in the
  ⋮ menu. Every AI picture button, such as Improve or Make it, makes that many
  new thumbnails to pick from. The price on every AI button is for the number
  picked. This browser remembers the choice for next time
  (`video-thumbnail-tries`).
- **Picture model:** Nano Banana 2 to start with, about 7¢ a picture, with
  Nano Banana and GPT Image 2 in the dropdown.
- **Every picture press makes new versions** and leaves the one it started
  from as it was. The first new one opens on the board with the before and
  after slider over the changed picture
  ([picture-clean-up.md](picture-clean-up.md)).
- **Improve with AI** on a picture layer: Brighter, Cleaner, Cut me out (the
  person on see-through, for an outline), New background (with words for what
  goes behind) and My own words.
- **Clean up** on a picture layer: Sharpen and enlarge, Remove reflection, and
  Remove an object with words for what should go.
- **Your actor:** pick one of your actors and how they look ("surprised",
  "pointing at the camera", or your own words). Up to three of the actor's
  sheet pictures go with the request, and the person comes back cut out with a
  white outline, on the right of a wide thumbnail.

## Ideas from the video

- **Three ideas** reads the video's script (its voice lines and its words on
  screen), its saved transcripts and one frame every 5 seconds. A video longer
  than 5 minutes sends 60 frames spread evenly.
- **Each idea** is a moment, up to five words in capitals, the expression and
  the background.
- **Make it** takes that moment's frame, asks the picture model to turn it
  into a thumbnail photo with that expression and background, and puts the
  words on in the "one word in yellow" look.
- **No script and no transcript:** it says so and points at the Transcript
  panel's Write it down.
- **Who reads it:** Gemini 3.8 Flash, because it has to look at the frames.
  The task said "the writing AI"; the saved writing AI takes words only, so
  anything that looks at pictures goes to Gemini.

## Title, check and other languages

- **Write five titles** asks the saved writing AI for eight and keeps the
  first five that don't repeat a word the thumbnail shows. Little words such
  as "the" and "you" don't count. Each has Copy and Use this title. The used
  title shows under the YouTube-size pictures and is saved with the version.
- **Check it**, in the ⋮ menu, sends the thumbnail at full size and at 168 pixels wide to
  Gemini, and gets a mark out of 10 with one fix for each of three things:
  whether the words read small, whether the face is big enough, and whether
  the colours stand out. The check is kept with the version and says "Out of
  date" once the version changes. It only runs when pressed.
- **Other languages** has a button for each language copy of the video
  ([another-language.md](another-language.md)), such as "Make it in Spanish".
  It copies the main thumbnail onto the copy's video with every words layer
  translated by the writing AI. A longer translation is made smaller by as
  much as it grew, so it stays in its box.

## How it looks on YouTube

**Preview** in the editor's top bar, left of Share, shows up while the
Thumbnail section is open (Tyler, 3 Nov 2026). It opens a dropdown with the
open thumbnail at three sizes, beside its title and "Your channel": Home feed (360 wide), Phone (320 wide) and Up next (168 wide).
A tall cover shows at 180 and 120 wide. **These widths are a first guess and
have not been measured on youtube.com yet.**

## Templates and copying a style

- **Save as a template:** Templates in the ⋮ menu names it. Everyone on the site
  can start from it (Tyler, 3 Nov 2026). Picture layers become empty spots, so
  nobody's picture travels with a template.
- **Deleting:** whoever saved a template, or a site admin, can delete it.
- **Copy a style**, in the ⋮ menu, takes a pasted YouTube link or a picture
  from the media library.
  Gemini describes the layout (where the pictures and words are, their
  colours, outlines and boxes) and it becomes a template with empty spots and
  "YOUR WORDS". The other picture is never put on the board or kept. A link's
  thumbnail is only ever fetched from YouTube's own picture host, i.ytimg.com,
  built from the link's video id, with redirects refused.

## The download and the export cover

- **Download for YouTube** gives a JPEG at exactly 1280 × 720 (or 1080 ×
  1920). The quality comes down in steps until the file is under YouTube's 2MB
  limit. A picture of pure noise came out at the right size under 2MB in the
  tests.
- **The main thumbnail is the cover** of the video's exports on the Exports
  page and on share links: the wide one on 16:9 exports, the tall one on 9:16.
  A square or 4:3 export keeps its frame cover. An export finished later gets
  it too.
- **"Use this moment"** on an export still sets a frame cover, and that
  export keeps it from then on (`cover_by_hand`).

## Guests sent from Project

A guest gets the whole section, AI included, paid from the project owner's
keys (Tyler, 3 Nov 2026). Their thumbnails are the owner's. Two things a guest
can't do, because the calls behind them are the owner's own: upload a picture
or an emoji (uploads go to the owner's library), and pick an actor. Every
other AI button outside this section stays off for guests
([project-guests.md](project-guests.md)).

## Spend

Picture changes count under "Pictures". The rest have lines of their own:
"Thumbnail ideas", "Thumbnail titles", "Thumbnail check", "Copy a style" and
"Thumbnail translation". The video's spend limit can refuse a press before
anything is sent. Gemini's picture reading is priced at 1,120 tokens a
picture, which no real run has been measured against yet.

## Where it lives in the code

- **Data:** `drizzle/0149_video_thumbnails.sql` adds `video_thumbnails`,
  `video_thumbnail_templates` and `video_render_jobs.cover_by_hand`. Applied
  to the local database only.
- **Rules both ends share:** `src/lib/video/thumbnails.ts` (layers, looks,
  templates, the effect filter) and `src/lib/video/thumbnail-ai.ts` (ideas,
  link reading, title repeats, prices).
- **Server:** `src/server/video/thumbnails.ts` (records, stars, covers,
  templates), `thumbnail-export.ts` (drawing and the JPEG) and
  `thumbnail-ai.ts` (every AI press).
- **Endpoints:** `src/lib/api/video/thumbnails.ts` and `thumbnail-ai.ts`.
- **Screens:** `src/components/video-thumbnails/`: the panel, the board, the
  right panel, the add card, the layer drawing and the shared state.

## Checked so far

- **Drawing, for real with resvg** (`thumbnail-export.test.ts`): an outline
  colours the ring just outside a cut-out, a brightness slider darkens the
  picture, the last word comes out yellow and the rest white, an arrow lands
  in its box, and noise comes out at 1280 × 720 under 2MB.
- **Records, on a real database** (`thumbnails.test.ts`): a thumbnail lists
  only on its own video and for its owner, a save from an older copy is
  refused, one library picture per shape moves to the newly starred version,
  unstarring removes it unless a timeline uses it, the main one is the Videos
  tab picture, and only the wide, not-by-hand export gets the cover.
  Templates show to everyone on the site and nobody elsewhere, and only the
  maker or an admin deletes one.
- **AI, with the models stood in for** (`thumbnail-ai.test.ts`): 4 tries make
  4 versions with only the picture changed, a cut-out fits its box, titles
  that repeat the thumbnail are dropped, the check keeps its version, a video
  with no words is refused, links only reach i.ytimg.com, and a translation
  lands on the language copy smaller than the original.
- **Not yet:** nothing has been opened in a browser, because no dev server was
  running on port 3016. No real picture model, Gemini or writer call has been
  made, because the local keys spend real money.
