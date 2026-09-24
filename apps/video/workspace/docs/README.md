# Video docs

This folder belongs to the Video app. Nothing in it comes from Custom Shell, so
nothing in it ever conflicts when the shell is merged in. Everything true of
every app built on the shell is in the repo's `docs/shell/` instead.

## What is in this folder

- [editor-chrome.md](editor-chrome.md) — which lines around the editor come from
  the shell, which ones the editor draws itself, and why it never hides a shell
  one.
- [clip-volume-and-speed.md](clip-volume-and-speed.md) — how loud and how fast
  one clip plays, why volume stops at full, and how a speed other than 1x
  changes every sum that turns clip time into file time.
- [clip-frame-fit.md](clip-frame-fit.md) — the choice between fitting a clip
  inside the frame and filling it, why fitting is the default, exactly how
  much of a wide shot filling cuts off, and a picture's Size slider.
- [clip-colour.md](clip-colour.md) — what the brightness, contrast and
  saturation sliders do, and how the preview matches the export's `eq` filter
  to within a few levels.
- [clip-motion.md](clip-motion.md) — the four slow moves a still picture can
  make across its time on screen, and why the export draws them with
  `perspective` rather than `zoompan`.
- [copy-clips-between-projects.md](copy-clips-between-projects.md) — copying
  clips out of one project and pasting them into another, where they land,
  and what travels with them.
- [waveforms.md](waveforms.md) — the shape of the sound drawn along a sound
  clip, how the background worker builds it, and why trimming slides the shape
  instead of squashing it.
- [background-music.md](background-music.md) — the Music panel: where the
  tracks come from, why a track arrives ducked and at a quarter volume, and
  what happens when the music and the video are different lengths.
- [remembered-view.md](remembered-view.md) — how a project reopens with the
  left panel, playhead, zoom, scroll and selected clip you left it at, where
  that is kept, and what it does not survive.
- [stickers.md](stickers.md) — the Text panel's stickers: each person's own
  emoji and pictures, where the list is stored, where a sticker lands, and
  what happens to a project whose picture sticker's file is deleted.
- [caption-look.md](caption-look.md) — the caption look saved in the brand
  kit, which captions start from it, and why captions already on a project
  never change.
- [word-by-word-captions.md](word-by-word-captions.md) — captions that light
  up each word as it is said: where it is switched on, where the word times
  come from, what happens when the words are edited, and what it costs to
  export.
- [another-language.md](another-language.md) — translating what is said into
  another language, which AI does which half, why nothing lands until it is
  read and corrected, how the original is turned down under a new voice, and
  what it costs.
- [saved-voiceovers.md](saved-voiceovers.md) — the Voiceovers panel: what is
  kept beside every voiceover read aloud, how one is laid at the playhead with
  its captions, and what happens when its file is deleted.
- [writing-with-ai.md](writing-with-ai.md) — which AI rewrites words (Gemini,
  GPT or Claude), which tools use the choice, and what happens when a key is
  removed.
- [stopping-an-export.md](stopping-an-export.md) — what pressing Stop does to
  an export that is waiting or already being made, how fast the next one
  starts, and why nothing is left in storage.
- [export-shapes.md](export-shapes.md) — exporting one project in several
  shapes from one press, the one-per-shape rule, and why words need checking
  by eye in each shape.
- [long-exports.md](long-exports.md) — why a project can be up to thirty
  minutes and no longer, what moved with the limit, the measured render
  times, and how the export window's time estimate is worked out.
- [frame-rate.md](frame-rate.md) — the choice of 30 or 60 frames a second on
  export, what it does to footage shot at each, the measured file sizes, and
  why 30 stays the default.
- [retrying-an-export.md](retrying-an-export.md) — the Try again button on a
  failed export: when it is allowed, and what it resets.
- [share-links.md](share-links.md) — a link to one finished export that
  somebody with no account can watch: what it shows, how to turn it off, and
  why the link is the only lock on the file.
- [export-storage.md](export-storage.md) — the space finished exports take,
  what deleting an export or a project removes from storage, and clearing out
  every export older than a date, with shared ones kept unless ticked.
- [saved-frames.md](saved-frames.md) — keeping one frame of an export or of
  the editor as a picture: where the two buttons are, what size the picture
  is, where it lands, and when the editor picture and the preview differ.
- [media-collections.md](media-collections.md) — named groups of your own
  files in the editor's Media panel: whose they are, how to fill them many at
  a time, why deleting one never deletes a file, and when another tab sees a
  new one.
- [project-thumbnails.md](project-thumbnails.md) — the picture beside each
  project on the projects list: which frame it is, when the background worker
  remakes it, and what shows when a project has nothing to take a picture of.
- [media-addresses.md](media-addresses.md) — where the address of a picture or a
  clip comes from, and why every call that asks for one waits for the answer.

The AI tools, the credit ledger and the rest of the export and render path were
built before this folder existed, and none of them is written up.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says.
