# The caption look

The brand kit holds one saved look for captions, and every caption the app
writes from then on starts from it. Captions already on a timeline never change.

## What the look is

- **Six settings:** the size, the colour of the words, whether they sit on a
  box, the box colour, how they arrive (None, Pop, Rise or Bounce), and how far
  down the frame they sit. They are always centred across.
- **Where it is set:** Brand panel, then Edit brand kit, then the Captions card.
  The card draws a sample caption on a small tall frame beside the controls.
- **Where it is kept:** under `captions` in the brand kit, which is the JSON in
  `video_settings.brand_kit`. The shape and the reading rules are in
  `src/lib/video/caption-look.ts`.
- **A kit saved before the look existed:** reads back as the look captions
  always had, which is white 64 px words on a black box, 78% of the way down,
  with no entrance. There was no migration. The reader fills in any setting
  that is missing or unusable.

## Which captions use it

- **The Captions tool** in the AI panel. Its window opens with the saved look
  already filled in. A change made in that window applies to that one run and
  is not saved back. The brand kit is the only place the look is kept.
- **The Voice tool.** The captions that come with a read-aloud voice take the
  saved look. The window only offers the entrance, and it starts on the saved
  one.
- **Both windows read the kit again every time they open.** A look saved a
  moment ago in the Brand panel is the one used, with no reload.
- **If the kit cannot be read,** the window says so in an error toast and
  starts from the standard white-on-black look. It does not refuse to caption.

## Why it only touches new captions

- **A caption stores its own look.** Every caption clip on a timeline carries
  its own size, colour, box, entrance and place. Nothing on the timeline points
  back at the brand kit.
- **Restyling old projects would undo hand edits.** Someone may have moved one
  caption off a face, or recoloured one line. Reaching back into every project
  would throw that work away without asking.
- **An export would change without anyone opening the project.** A video made
  last month should come out the same if it is made again.

To restyle captions already on a project, select them and change them in the
inspector.

## How the sample matches the real caption

The sample uses the same drawing rules as the editor's preview
(`src/components/video-editor/editor-preview.tsx`). The words are anchored at
their middle, and the size is scaled from the 1080-pixel-tall frame the app
measures all text in. The entrance plays with the numbers in
`src/lib/video/caption-animations.ts`, which the export also uses.

Checked on 23 Sep 2026 with 100 px pink words on a green box, 30% down. On a
256-pixel sample the words were 23.7 pixels tall. On a 463-pixel preview they
were 42.9 pixels tall. Both are 9.26 pixels of text for every 100 pixels of
frame, and both wrapped the test line onto three lines.

The sample is always the tall 9:16 shape, because most captioned video is made
for phones. On a wide project the same caption takes up less of the width.
