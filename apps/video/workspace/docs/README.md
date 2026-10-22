# Video docs

This folder belongs to the Video app. Nothing in it comes from Custom Shell, so
nothing in it ever conflicts when the shell is merged in. Everything true of
every app built on the shell is in the repo's `docs/shell/` instead.

## What is in this folder

- [launch.md](launch.md) — where Video runs live, every value it needs, how to
  deploy it, and the record of each release.
- [shell-integration.md](shell-integration.md) — what the shell gives Video,
  what the last merge carried, the migrations it owes, and the files that stay
  Video's own.
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
- [clip-fades.md](clip-fades.md) — the four fade sliders for sound and
  picture, what happens when two fades are longer than the clip, why a
  transition wins over a picture fade at its seam, and how a split shares the
  fades out.
- [clip-motion.md](clip-motion.md) — the four slow moves a still picture can
  make across its time on screen, and why the export draws them with
  `perspective` rather than `zoompan`.
- [copy-clips-between-projects.md](copy-clips-between-projects.md) — copying
  clips out of one project and pasting them into another, where they land,
  and what travels with them.
- [getting-media-ready.md](getting-media-ready.md) — the "getting it ready to
  scrub" and "getting frames ready" markers: what the background worker makes
  for every video, how long it takes, what a failure looks like, what Try
  again does, and how often the editor asks.
- [waveforms.md](waveforms.md) — the shape of the sound drawn along a sound
  clip and in a strip along the bottom of a video clip, how the background
  worker builds it, and why trimming slides the shape instead of squashing it.
- [background-music.md](background-music.md) — the Music panel: where the
  tracks come from, why a track arrives ducked and at a quarter volume, and
  what happens when the music and the video are different lengths.
- [remembered-view.md](remembered-view.md) — how a project reopens with the
  left panel, playhead, zoom, scroll and selected clip you left it at, where
  that is kept, and what it does not survive.
- [stickers.md](stickers.md) — the Text panel's stickers: each person's own
  emoji and pictures, where the list is stored, where a sticker lands, and
  what happens to a project whose picture sticker's file is deleted.
- [text-fonts.md](text-fonts.md) — the five faces video text, captions and
  carousel slides can be drawn in, their licences, how the preview and the export stay
  in step, and what the extra files cost to download.
- [caption-look.md](caption-look.md) — the look every new caption starts
  from, saved on Settings, Captions: font, outline, capitals, words at a time,
  the Plain, Karaoke and Bold presets, which windows use it, and why captions
  already on a project never change.
- [safe-box.md](safe-box.md) — keeping new captions out of the strips TikTok,
  Reels and Shorts cover: where a caption lands, the starting numbers and where
  they came from, and why they are settings.
- [word-by-word-captions.md](word-by-word-captions.md) — captions that light
  up each word as it is said: where it is switched on, where the word times
  come from, what happens when the words are edited, and what it costs to
  export.
- [saved-transcripts.md](saved-transcripts.md) — a recording written down
  once and kept: which tools read the kept words, why Whisper's and Gemini's
  are kept apart, Transcribe again, the pieces a long recording is sent in,
  and what deleting removes.
- [price-before-you-press.md](price-before-you-press.md) — the price on the
  Captions, Hook, Another language and Transcript buttons: what each one
  counts, how it is worked out from the shell's price list, and how it
  compared with the meter.
- [another-language.md](another-language.md) — translating what is said into
  another language, or several at once as copies of the project with an
  export each, which AI does which half, why nothing lands until it is read
  and corrected, how the original is turned down under a new voice, how the
  Exports page groups the copies, and what it costs.
- [saved-voiceovers.md](saved-voiceovers.md) — the Voiceovers panel: what is
  kept beside every voiceover read aloud, how one is laid at the playhead with
  its captions, and what happens when its file is deleted.
- [script-check.md](script-check.md) — the Voice window's run length as you
  type and its "Check it" button: the five rules, where they came from, why it
  is a checklist and not a prediction, the banned words on Settings → Scripts,
  and what a check costs.
- [voice-direction.md](voice-direction.md) — directing the voice with
  [whispering] and pauses, how a pause is sent to each model, steadiness and
  expressiveness, and a voice made from your own recording: who sees it, what
  it costs and what deleting it removes.
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
- [export-storage.md](export-storage.md) — what deleting an export or a
  project removes from storage, and clearing out every export older than a
  date, with shared ones kept unless ticked.
- [saved-frames.md](saved-frames.md) — keeping one frame of an export or of
  the editor as a picture: where the two buttons are, what size the picture
  is, where it lands, and when the editor picture and the preview differ.
- [media-panel.md](media-panel.md) — the editor's Media panel: the + menu
  that uploads files or makes a collection, and why only dragging, never a
  click, puts a file on the timeline.
- [media-collections.md](media-collections.md) — named groups of your own
  files in the editor's Media panel: whose they are, how to fill them many at
  a time, why deleting one never deletes a file, and when another tab sees a
  new one.
- [project-thumbnails.md](project-thumbnails.md) — the picture beside each
  project on the projects list: which frame it is, when the background worker
  remakes it, and what shows when a project has nothing to take a picture of.
- [project-folders.md](project-folders.md) — folders on the projects list:
  whose they are, why a project sits in one folder at most, where the buttons
  are, and why deleting a folder never deletes a project.
- [project-history.md](project-history.md) — the History panel: which
  earlier versions of a project are kept and when, the twenty-per-project
  limit, looking at one without changing anything, why a restore can be
  undone, and the measured storage cost.
- [project-guests.md](project-guests.md) — somebody sent from a Project task
  editing one video project with no Video account: the one-minute,
  one-use link, the 12-hour sign-in, what a guest can and can't do, and the
  `PROJECT_HANDOFF_KEY` setting.
- [two-windows.md](two-windows.md) — one project open in two windows: the
  warning the second window shows, what read-only stops, and the
  "(unsaved edits)" project that keeps the work of whichever window saves
  second.
- [longer-ai-clips.md](longer-ai-clips.md) — the video model (Gemini Omni
  Flash, since Google switches Veo off on 22 Oct 2026), the Draft, Normal and
  Sharp sizes and their prices, and how a shot longer than eight seconds is
  made.
- [media-addresses.md](media-addresses.md) — where the address of a picture or a
  clip comes from, and why every call that asks for one waits for the answer.
- [viral-projects.md](viral-projects.md) — Viral as projects, one niche
  each: the description and keywords, the three panels, the background search
  and what it costs, the allowance check, the New badge, the topic match,
  creators found and followed, hidden channels, favourites, pasting a video's
  link in, the Hooks board, and what the move from the old Viral and Creators
  pages did.
- [viral-search.md](viral-search.md) — the YouTube key behind Viral: where it
  goes, the three calls one keyword makes, and why Shorts means 3 minutes or
  less.
- [viral-score.md](viral-score.md) — the 0 to 100 viral score on every Viral
  video: its five parts and their weights, one worked example, what
  "sure: medium" means, and why the score is worked out on every read.
- [project-first.md](project-first.md) — what belongs to a project and what
  is shared, the Copy and Exports panels at the foot of the rail, Make this a template,
  a project's AI spend and its spend limit, and archive, pin and the actor
  filter on the projects list.
- [several-ai-clips.md](several-ai-clips.md) — up to three AI shots at once
  in a project and six per person: why the caps exist, how shots still being
  made count against the allowance and the spend limit, and how the worker
  keeps every shot moving.
- [actors.md](actors.md) — an actor's character sheet: several pictures of
  one person with one main picture, which ones a first frame sends on the
  person board, and what removing or deleting keeps.
- [extras.md](extras.md) — clothing, backdrops, props and hair looks: the tabs
  on the Actors dashboard, the Extras button, the 4-picture person board, and
  what the first frame and the shot are sent.
- [animate-a-still.md](animate-a-still.md) — Make it move on a timeline
  picture: the right-click window, what is sent, how the moving shot takes
  the picture's place as one Undo step, who lands it when the tab is closed,
  and what happens when the picture is gone.
- [regenerate-a-scene.md](regenerate-a-scene.md) — Make it again on a clip
  the AI made: what a picture, a moving clip and a voice line remember, which
  tools write it, the window and its price, what the swap keeps, the length
  rule for a voice line and what happens to its captions.
- [brief-to-video.md](brief-to-video.md) — a brief written into a script,
  cut into scenes on a priced storyboard, then made into stills, voice lines
  and captions laid end to end: what the writer is asked, where scenes land,
  who lays them, what a failed scene leaves, and what it costs.
- [say-what-ai-made.md](say-what-ai-made.md) — the Made by AI card in an
  export's window: which parts are listed, how the render works them out from
  the timeline it draws, the Edited by hand tick, the one-paragraph copy for
  YouTube and TikTok, and why the voice is the part platforms cannot see.
- [b-roll.md](b-roll.md) — free Pexels clips under each sentence of the voice
  line: where the key goes, how sentences are cut, the phrase rules and why,
  the 200-an-hour request budget, where the credit is kept, and how a short
  clip holds its last frame.
- [ai-clip.md](ai-clip.md) — the editor's AI clip panel: an actor, a first
  frame, a shot, then dragging it onto the timeline; what each step costs,
  where frames and shots are kept, and a carousel from first frames.
- [carousel-shapes.md](carousel-shapes.md) — changing a carousel between
  4:5, square and story: the Format buttons, making a copy in another shape,
  the rule that moves each layer, what it will not fix, and the flag on text
  that no longer fits its box.
- [carousel-push-layout.md](carousel-push-layout.md) — Align all slides, copying one slide's
  layout onto other slides: what travels (place, size, font, colour, Fit),
  what never does (words, pictures, background), how layers are matched, and
  the one Undo that puts it all back.
- [carousel-slide-order.md](carousel-slide-order.md) — dragging slides into a
  new order in the list or grid, by mouse, finger or keyboard, and Cmd+Z and
  Shift+Cmd+Z in the carousel editor.
- [carousel-snapping.md](carousel-snapping.md) — snapping a dragged layer to
  the slide, to other layers and to equal gaps, the eight resize handles,
  arrow-key nudging, picking several layers, and copy and paste.
- [carousel-text-styles.md](carousel-text-styles.md) — bold and highlighted
  words, line and letter spacing, the box behind the words and the outline,
  why bold is drawn as an outline, and how the export puts lines where the
  canvas does.
- [carousel-slide-numbers.md](carousel-slide-numbers.md) — the "3/7" layer
  that renumbers itself, on one slide or every slide.
- [carousel-layers.md](carousel-layers.md) — the Layers list: picking, hiding
  and locking layers.
- [carousel-guides.md](carousel-guides.md) — the Instagram guides on the
  canvas: what a story and the profile grid hide, and where each number comes
  from.
- [carousel-preview.md](carousel-preview.md) — the phone-shaped Preview you
  swipe through one slide at a time.
- [carousel-pictures.md](carousel-pictures.md) — dropping pictures and clips
  on a slide, moving a cropped picture inside its box, collections and free
  Pexels photos in the Image panel, and stickers in carousels.
- [carousel-video-slides.md](carousel-video-slides.md) — a clip on a slide:
  one a slide, played muted in the editor, exported as an MP4 with the other
  layers over it.
- [carousel-writing.md](carousel-writing.md) — AI writing a whole carousel
  from a topic, notes, a project or a web page, three stronger first lines,
  the caption, and copies in other languages; how a web page is read safely.
- [carousel-video.md](carousel-video.md) — a carousel made into a 9:16 reel:
  seconds per slide, the change between slides, music, and the project it
  makes.
- [carousel-templates.md](carousel-templates.md) — marking a carousel as a
  template and starting new ones from it.
- [carousel-projects.md](carousel-projects.md) — carousels that belong to a
  project, where the project lists them, and what deleting the project asks.
- [carousel-history.md](carousel-history.md) — a carousel's earlier versions,
  kept by the projects' rule, and bringing one back.
- [carousel-exports.md](carousel-exports.md) — a carousel export kept on its
  own Carousel exports dashboard: the ZIP, its cover, the menu link under
  Carousels, downloading, sharing and clearing out, why it is a row of the
  video exports table, and why deleting the carousel keeps it.
- [visual-style.md](visual-style.md) — a project's look: the style line and
  look picture set in a project's Settings window, which AI tools send them, and
  why a bad style line spoils every scene at once.
- [creator-research.md](creator-research.md) — following a creator, the
  six-hourly watch timer, pausing one creator, what Download and Break it down
  download, spend and write down, and what deleting a saved video removes.

The AI tools, the credit ledger and the rest of the export and render path were
built before this folder existed, and none of them is written up.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says.
