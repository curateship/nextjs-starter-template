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
  the shell, which ones the editor draws itself, why it never hides a shell
  one, and the one Sounds button with Music, Sounds and Voices as tabs.
- [clip-volume-and-speed.md](clip-volume-and-speed.md) — how loud and how fast
  one clip plays, why volume stops at full, and how a speed other than 1x
  changes every sum that turns clip time into file time.
- [clip-frame-fit.md](clip-frame-fit.md) — the choice between fitting a clip
  inside the frame and filling it, why fitting is the default, exactly how
  much of a wide shot filling cuts off, sliding which part of a filled clip
  shows, and the Size slider on pictures and videos.
- [clip-colour.md](clip-colour.md) — what the brightness, contrast and
  saturation sliders do, and how the preview matches the export's `eq` filter
  to within a few levels.
- [colour-looks.md](colour-looks.md) — the eight film looks and your own
  saved looks on the Colour card, and how one LUT is drawn the same in the
  preview and the export.
- [clip-fades.md](clip-fades.md) — the four fade sliders for sound and
  picture, what happens when two fades are longer than the clip, why a
  transition wins over a picture fade at its seam, and how a split shares the
  fades out.
- [video-on-video.md](video-on-video.md) — a video smaller than the frame
  over another: the Size slider, the corner box and the two splits, the box
  a split clip is fitted into, the round bubble and its border, and how one
  shared player is placed per clip.
- [shapes.md](shapes.md) — arrows and circles over the video: adding and
  placing one, drawing itself on, and why a picked shape shows whole while
  paused.
- [social-stickers.md](social-stickers.md) — the Graphics panel's comment
  reply, Subscribe button and Link in bio: the looks, the Subscribe film and
  choosing its click sound, the name and picture, and how the preview and the
  export draw the same thing.
- [blur.md](blur.md) — a blur over one spot: adding it from Shapes or a
  clip's right-click, box or oval, strength, what it blurs, and following a
  moving thing or a face with AI.
- [picture-clean-up.md](picture-clean-up.md) — Remove reflection and Remove
  an object on a picture clip, the swap and its Undo, and the before and
  after slider.
- [thumbnails.md](thumbnails.md) — the Thumbnail section: the board, versions
  and the main one, text and picture looks, every AI tool, titles, the check,
  templates, the download and the export cover.
- [progress-bar.md](progress-bar.md) — the bar that fills along one edge as
  the video plays: one per project, where it sits against the safe box, and
  how its thickness is counted.
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
- [clean-up-the-voice.md](clean-up-the-voice.md) — taking hum and hiss
  out of a clip's sound at three strengths: the two ffmpeg stages, the
  measured numbers, and the cleaned copy the preview waits for.
- [ads.md](ads.md) — the Ads panel: the ads shelf, placing ads in equal
  parts or where viewers stay, pause or over, text ads, the AI sponsor read,
  volume and length, the ad rules on Settings, and ads on the progress bar,
  the viewer curve, language copies and carousels.
- [sound-effects.md](sound-effects.md) — the Sounds panel: thirty starter
  sounds made by a script, where they are kept, your own uploaded sounds, and
  the shell fix that made sound uploads work.
- [beat-snapping.md](beat-snapping.md) — beat ticks on music clips and clip
  edges snapping to them: how the worker finds the beats, how well it does,
  and what it has not been tried on.
- [background-music.md](background-music.md) — the Music panel: where the
  tracks come from, why a track arrives ducked and at a quarter volume, and
  what happens when the music and the video are different lengths.
- [ai-music.md](ai-music.md) — music made to fit by ElevenLabs Music: the
  mood box, the length and its 5 minute cap, where the track lands, and what
  it costs.
- [remembered-view.md](remembered-view.md) — how a project reopens with the
  left panel, playhead, zoom, scroll and selected clip you left it at, where
  that is kept, and what it does not survive.
- [stickers.md](stickers.md) — the Graphics panel's stickers: each person's own
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
- [long-exports.md](long-exports.md) — why a project of any length exports
  now and what the old thirty-minute limit was for, the measured render
  times, and how the export window's time estimate is worked out.
- [big-files.md](big-files.md) — what Video does with a video of 20GB to
  100GB and more: the copies kept on the server's disk, waiting for room on
  it, the smooth copy's time limit and notice, frames along long videos,
  exports that read only the stretch they use, exporting part of a project,
  captions and Tighten on long recordings, the timeline's furthest zoom and
  searching what was said.
- [frame-rate.md](frame-rate.md) — the choice of 30 or 60 frames a second on
  export, what it does to footage shot at each, the measured file sizes, and
  why 30 stays the default.
- [export-notices.md](export-notices.md) — the bell notice when a video
  export is ready or failed, what sends none, and why it has no link.
- [retrying-an-export.md](retrying-an-export.md) — the Try again button on a
  failed export: when it is allowed, and what it resets.
- [viral-connection.md](viral-connection.md) — Send to Video from the Viral app:
  the key on Settings → Viral, the draft with its script and the original
  on the Media shelf, Replace, and the messages between the two apps.
- [send-to-promo.md](send-to-promo.md) — Send to Promo: copying a finished
  video, carousel or thumbnail into a Promo project's Archive, the key on
  Settings → Promo, the send window, subtitles, slideshows, posted marks and
  Ask for a video.
- [share-links.md](share-links.md) — a link to one finished export that
  somebody with no account can watch: what it shows, how to turn it off, and
  why the link is the only lock on the file.
- [export-storage.md](export-storage.md) — what deleting an export or a
  project removes from storage, and clearing out every export older than a
  date, with shared ones kept unless ticked.
- [saved-frames.md](saved-frames.md) — keeping one frame of an export or of
  the editor as a picture: where the two buttons are, what size the picture
  is, where it lands, and when the editor picture and the preview differ.
- [media-panel.md](media-panel.md) — the editor's Media panel: the filter
  menu and its saved views, the + menu
  that uploads files or makes a collection, and why only dragging, never a
  click, puts a file on the timeline.
- [phone-uploads.md](phone-uploads.md) — sending videos and photos from a
  phone's camera roll by scanning a code: how long the code and the phone's
  sign-in last, how the secret is kept out of logs, and how the editor hears
  a file arrived.
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
- [wan-and-seedance.md](wan-and-seedance.md) — the two other video models
  beside Google's, Wan 2.7 and Seedance 1.5 Pro: their keys and regions on
  Settings → AI video, what each takes (actor pictures, an end picture, a
  voiceover), their prices, the meter rows Video writes for them, and Try on
  all models.
- [longer-ai-clips.md](longer-ai-clips.md) — the video model (Gemini Omni
  Flash, since Google switches Veo off on 22 Oct 2026), the Draft, Normal and
  Sharp sizes and their prices, and how a shot longer than eight seconds is
  made.
- [media-addresses.md](media-addresses.md) — where the address of a picture or a
  clip comes from, and why every call that asks for one waits for the answer.
- [project-videos.md](project-videos.md) — a project holds many videos: what
  is set once on the project and what on each video, the Videos tab, the
  remembered last video, each video's own AI spend limit, and the move from
  one video per project (migration 0145).
- [project-first.md](project-first.md) — what belongs to a project and what
  is shared, the Copy panel and the worker that breaks its viral video down,
  the Exports panel, AI spend, and archive, pin and the actor filter on the
  projects list.
- [several-ai-clips.md](several-ai-clips.md) — up to three AI shots at once
  in a project and six per person: why the caps exist, how shots still being
  made count against the allowance and the spend limit, and how the worker
  keeps every shot moving.
- [actors.md](actors.md) — an actor's character sheet: several pictures of
  one person with one main picture, which ones a first frame sends on the
  person board, the voice it speaks in, and what removing or deleting keeps.
- [extras.md](extras.md) — clothing, backdrops, props and hair looks: the tabs
  on the Actors dashboard, the Extras button, the 4-picture person board, and
  what the first frame and the shot are sent.
- [lip-sync.md](lip-sync.md) — Match the lips with Sync Labs: which voice,
  the price, the wait, what is sent and deleted, and how the matched clip
  takes the old one's place.
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
- [retention-curve.md](retention-curve.md) — signing in to one YouTube
  channel, pasting a posted video's link on its export, the two figures
  YouTube measures, the scene columns saved with each export, the day or two
  of lag, and that it only ever reads the channel.
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
- [carousel-project-carousels.md](carousel-project-carousels.md) — a carousel
  project holds many carousels: the projects table, the Carousels tab, the
  shared picture shelf, the look and caption footer, old links, and the move
  to carousel projects (migration 0146).
- [carousel-projects.md](carousel-projects.md) — carousels made from a video
  project, where that project lists them, and what deleting it asks.
- [carousel-history.md](carousel-history.md) — a carousel's earlier versions,
  kept by the projects' rule, and bringing one back.
- [carousel-exports.md](carousel-exports.md) — a carousel export kept on its
  own Carousel exports dashboard: the ZIP, its cover, the menu link under
  Carousels, downloading, sharing and clearing out, why it is a row of the
  video exports table, and why deleting the carousel keeps it.
- [visual-style.md](visual-style.md) — a project's look: the style line and
  look picture set in a project's Settings window, which AI tools send them, and
  why a bad style line spoils every scene at once.

The AI tools, the credit ledger and the rest of the export and render path were
built before this folder existed, and none of them is written up.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says.
