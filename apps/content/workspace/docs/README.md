# Content's own docs

What is true of the Content app. What is true of every app built on the shell
is in the repo's `docs/`, and is never copied here.

Content is Video, Promo and Viral in one app, so this folder holds the three
apps' docs, listed below under the app each came from. Where one of them says
"Video", "Promo" or "Viral", it means that part of Content.

## Content

- [content-app.md](content-app.md) — how the three fit together: one project
  under one id, a project's page under the Projects dashboard's left panel
  with Content, Research and Promote in one header, Content's one dropdown
  (All content to Drafts), each network's Voices and Accounts, Research's address and its
  settings in the project's ⋮, the editor's back button,
  the Projects dashboard's Found today, Videos in progress, Vault, Hooks and
  Formats, the one left menu, the sample project, the Project app's two
  links, the links between the three inside the app, and the three apps
  retired.
- [list-header.md](list-header.md) — every list's one header: search as an
  icon, the dropdowns right after it, Select and Jobs in the ⋮, the outlined
  buttons, and the shell dashboards it does not reach.

## From Video

### What is in this folder

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
- [social-stickers.md](social-stickers.md) — the Elements panel's comment
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
- [timer.md](timer.md) — the Timer in Shapes: a countdown over its own
  length with a ring that empties and words above and below, how it steps
  once a second in the preview and the export, and why each second is drawn
  once.
- [progress-bar.md](progress-bar.md) — the bar that fills along one edge as
  the video plays: one per project, where it sits against the safe box, and
  how its thickness is counted.
- [clip-loop.md](clip-loop.md) — a video or sound that starts again when
  its file runs out, so it can be stretched as long as wanted: the Loop
  switch, how the preview and the export keep the same place, and why a
  looped sound is decoded to WAV.
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
- [stickers.md](stickers.md) — the Elements panel's stickers: each person's own
  emoji and pictures, where the list is stored, where a sticker lands, and
  what happens to a project whose picture sticker's file is deleted.
- [text-fonts.md](text-fonts.md) — the eight faces video text, captions,
  carousel slides and thumbnail words can be drawn in, their licences, how the preview and the export stay
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
  Captions, Another language and Transcript buttons: what each one
  counts, how it is worked out from the shell's price list, and how it
  compared with the meter.
- [another-language.md](another-language.md) — translating what is said into
  another language, or several at once as copies of the project with an
  export each, which AI does which half, why nothing lands until it is read
  and corrected, how the original is turned down under a new voice, how the
  Exports page groups the copies, and what it costs.
- [record-a-voiceover.md](record-a-voiceover.md) — recording a voiceover
  yourself from the Voices tab's +: why the take is sent as WAV, how Whisper
  writes its captions, what it costs, and why it is kept even when the
  captions fail.
- [saved-voiceovers.md](saved-voiceovers.md) — the Voices panel: its + menu,
  what is kept beside every voiceover, how one is laid at the playhead with
  its captions, and what happens when its file is deleted.
- [script-check.md](script-check.md) — the Read a script with AI window's run length as you
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
- [import-from-a-link.md](import-from-a-link.md) — pasting TikTok, Instagram
  and YouTube links into the Media panel: which links work, the Downloading
  tile, the name and creator kept with each file, the 100MB cap, Try again
  and Remove, and the worker's limits.
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
- [video-project-guests.md](video-project-guests.md) — somebody sent from a Project task
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
- [templates.md](templates.md) — the Templates panel: a template as saved
  instructions for the AI, the three starters, the video's card with its
  script box, scene breaks and picture notes, references and their
  breakdowns, music, languages, the cap, To review, and redoing only the
  scenes whose words changed.
- [flow.md](flow.md) — the Flow dashboard: a template of AI nodes on a
  canvas, each following only its prompt and holding the boxes it asks you
  for, lines carrying one node's result into the next, Wait for my OK, a run
  as a stepped guide that ends by saving into a project, the worker, what
  each node does, and what it costs.
- [say-what-ai-made.md](say-what-ai-made.md) — the Made by AI card in an
  export's window: which parts are listed, how the render works them out from
  the timeline it draws, the Edited by hand tick, the one-paragraph copy for
  YouTube and TikTok, and why the voice is the part platforms cannot see.
- [retention-curve.md](retention-curve.md) — signing in to one YouTube
  channel, pasting a posted video's link on its export, the two figures
  YouTube measures, the scene columns saved with each export, the day or two
  of lag, and that it only ever reads the channel.
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

- [timeline-markers.md](timeline-markers.md) — pins on the ruler: M or the
  pin button drops one at the playhead, a double-click names it, clip edges
  snap to it, and it is undone with the clips.
- [youtube-chapters.md](youtube-chapters.md) — the Chapters card in an export's
  window: named markers as "0:00 Intro" lines, YouTube's three rules, and how
  an intro or a part of a video moves them.
- [zoom-in-on-a-moment.md](zoom-in-on-a-moment.md) — the one-press punch-in on
  a video clip: the band and its handles, size and ease, why it is kept in the
  file's time, and only on a full-frame video.
- [copy-a-clips-look.md](copy-a-clips-look.md) — Copy look and Paste look on a
  clip's right-click menu: what travels per kind, what never does, and how a
  pasted speed resizes a clip.
- [even-out-clip-volume.md](even-out-clip-volume.md) — every file dropped from
  the Media panel arriving at -18 LUFS, raised at most 12 dB, and why the
  preview can only turn loud clips down.
- [steady-shaky-footage.md](steady-shaky-footage.md) — the Steady switch: the
  steadied copy the worker makes, vidstab or deshake, and why an export waits
  for it.
- [stick-to-a-moving-thing.md](stick-to-a-moving-thing.md) — text, arrows and
  circles, stickers and small videos following something, keeping their
  distance from it, and how a split shares the places out.
- [ai-sound-effects.md](ai-sound-effects.md) — Make a sound with AI in the
  Sounds tab: the words, the 0.5 to 30 second length, where it lands, and the
  price per length.
- [intro-and-outro.md](intro-and-outro.md) — a project's intro and outro, set
  in Project settings, added around every whole export, and the switch that
  leaves them off one.
- [fix-a-word.md](fix-a-word.md) — Fix these words in the Transcript panel: the
  copy of the speaker's voice, the swap, the stretched picture, captions, and
  what deleting the file removes.
- [teaser.md](teaser.md) — the Teaser tile: stills scored by Gemini, cuts on
  the music's beats, and the teaser laid at the start as one Undo step.
- [clip-menu.md](clip-menu.md) — the right-click menu every timeline clip
  has, with Copy, Paste, Duplicate and Delete first, and Delete taking away
  every picked clip as one Undo step.
- [windows-and-typing.md](windows-and-typing.md) — how Video's windows treat
  typing: red only after Save, the reason under a refused box, the count near
  a box's limit, Enter saving, why a greyed control is greyed, busy buttons
  that keep their width, and the "so far" count on long AI jobs.
- [times-and-lengths.md](times-and-lengths.md) — the one rule every length and
  time on screen is written by, rounded to the nearest second, and why 0:60
  no longer shows.

The AI tools, the credit ledger and the rest of the export and render path were
built before this folder existed, and none of them is written up.

### Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says.
- [No success toasts](no-success-toasts.md): nothing pops up when something works, and errors and part-done work still say so.

## From Promo

### How the code is laid out

- [Where the code lives](where-the-code-lives.md) — what every network shares,
  what belongs to Reddit alone, and how to add the next one.

### Projects

- [The Projects dashboard](projects-dashboard.md): Tyler's answers of
  12 Nov 2026, one three-panel dashboard of Overview, Projects, Accounts and
  Messages, the left page with its Dashboards block and Viral row, Overview's
  widgets, a project's summary with Open project, the old addresses that
  still land; and a project's own page with the same left panel, its one
  header (the project's tabs, dropdowns and ⋮), Promote's networks, the
  description, what the AI is told about what you make, and pausing a
  project.
- [Commenting inside a project](commenting.md): Tyler's answers of 5 Nov 2026,
  each network's Posts and Commenting (choices of Promote's dropdown since
  27 Nov 2026), the
  keywords dropdown in Commenting's header, what sits on each row, the counts, Pause
  commenting, the first post opening by itself, the address and old
  addresses, guests, and Reddit's keywords, posts, comment box, Today and
  accounts dropdown.
- [Networks as modules](network-modules.md): a project picks the networks it
  uses, each a choice of Promote's dropdown that fills the middle and right
  columns with your own posts on it, the two sides of each network,
  Reddit's screens folded into its module as tabs and windows, the tables that
  fold by the column's width, and where the old addresses lead.
- [The Archive](archive.md): each project's Content, All content, the project's
  videos, carousels and pictures, sent from Video
  or uploaded, the key on Settings → Video, how a send is copied,
  the Bin as a tab of the project's ⋮, and posting from it with drafts, warnings and several
  accounts at once.
- [The link with Viral](viral-link.md): the key on Settings → Viral, the X,
  LinkedIn and Reddit reads Promo runs for Viral, the posts Viral leaves as
  drafts, and the posts from Viral ideas reported back.
- [Guests sent from Project](project-guests.md): somebody on a Project task
  presses Open in Promo and works one Promo project for 12 hours with no
  Promo account, what they can and can't do, the stamped note and the key
  Promo shares with Project.

### Instagram and TikTok

- [Accounts and the daily reading](instagram/accounts-and-the-daily-reading.md):
  accounts on a phone only, one per phone per network, who is signed in, the
  daily reading with followers and the shadowban line off the app's Account
  status page, each post's numbers, and the module on a project's dashboard.
- [Posting a photo or video](instagram/posting.md): the media library file,
  the AI caption in the account's voice, Post once from the phone, the link,
  calling a post off, and what is refused.
- [An account's profile](instagram/profile.md): the name, bio, link and
  picture typed in by the phone, held back in the account's first day.
- [Comments on your posts](instagram/comments.md): read when the phone's
  notification says one arrived, listed with a suggested answer, sent only on
  a press.
- [What differs on TikTok](tiktok/what-differs-on-tiktok.md): no post count,
  longer captions, shorter bios and answers, Post rather than Share.

### Threads

- [Threads on the rack's phones](threads/threads-on-phones.md): a network of
  its own beside the phone's Instagram account, the daily reading, a post of
  one picture or video with its words, comments answered on a press, the
  name that stays Instagram's, and what waits for a phone.

### Medium

- [The Medium module](medium/medium-module.md): Tyler's answers of 21 Oct 2026,
  the keyword row and its four kinds, finding stories from Medium's feeds and
  search, the order with the writer's reach as measured, hiding a writer,
  tidying, Today, the count on the Medium row, and pausing Medium alone.
- [Responses on Medium](medium/responses.md): the story and its top responses,
  what you said before, drafts with the line they answer, Help only, the
  rewrites, Medium's own rules, every check on Post (warm-up, pace, one account
  per story, too similar), sending, the Responses tab, answering, edit, delete
  and Failed.
- [Articles on Medium](medium/articles.md): outline first, the article, the
  cover, earlier articles linked, from a Reddit comment, ideas, Publish, the
  numbers week by week, the public Medium list, and publications with their
  rules.
- [Medium accounts and signing in](medium/signing-in-and-accounts.md): adding
  one, the emailed sign-in link pasted into its own browser, who is signed in,
  its status, the warm-up, and what the Medium app on a phone does and does not.
- [How Medium is read](medium/how-medium-is-read.md): why a browser, Medium's own data
  addresses, what was proved against the real site and what waits for a real
  account, and the tests.

### X

- [The X module](x/x-module.md): Tyler's answers of 21 Oct 2026, the three
  kinds of keyword, watched accounts and their bell, ideas and trends, the
  order with freshness first, what never reaches To look at (closed replies,
  older than 12 hours, hidden accounts), Today and the AI spend.
- [Search accounts](x/search-accounts.md): why X needs a signed-in account that
  only reads, the views it may spend a day, the rate limit, several taking
  turns, and what a day's reading costs.
- [Replies on X](x/replies.md): the post and its top replies, drafts, Help
  only, quotes, every check on Post (no links, 280 characters, warm-up, pace,
  one account per post, too similar warns), follow back, the Replies tab,
  answers, mentions, edit, delete and Try again.
- [Posts of your own on X](x/posts.md): posts and threads, pictures, starting
  from a Medium article or a Reddit comment, polls, a set hour, communities
  and their rules, and the public list.
- [X accounts](x/accounts.md): adding one in a browser or on a phone, the
  sign-in code, lock screens, the daily look from outside, paid, follow back,
  direct messages, moving to a phone, and the warm-up.
- [How X is read](x/how-x-is-read.md): X's own data in the browser, the X app
  on a phone, what was checked, and that nothing has run against the real X
  yet.

### LinkedIn

- [The LinkedIn module](linkedin/linkedin-module.md): Tyler's answers of
  22 Oct 2026, the four kinds of keyword, watched people and pages, who the
  project sells to, the order with the writer's job title, what never reaches
  To look at (comments closed, bare reposts, older than 2 days, hidden
  people), an account's own feed, Today and the AI spend.
- [Search accounts](linkedin/search-accounts.md): why LinkedIn is read by a
  spare signed-in account that never comments, the 300 views a day, when one
  stops, and several taking turns.
- [Comments on LinkedIn](linkedin/comments.md): drafts, Help only, answering
  a top comment, the best comments as examples, every check on Post, reacting
  first, the Sent tab on Commenting, answers, edit, delete, Try again, and the weekly
  look at whether the comments still show.
- [Posts of your own on LinkedIn](linkedin/posts.md): posts with a picture, a
  video or a poll, the link in the first comment, tags, reposts, starting from
  a Medium article or a Reddit comment, post ideas, newsletter issues, groups
  and company pages.
- [People on LinkedIn](linkedin/people.md): connection requests with an AI note, under
  a weekly number in Settings → Behaviour (20 to begin with), accepting the
  requests waiting, and who viewed a profile.
- [LinkedIn accounts](linkedin/accounts.md): adding one, the emailed code,
  restriction screens, the warm-up, workday hours, Premium, the numbers week
  by week, important and throwaway, moving to a phone, and messages.
- [How LinkedIn is read](linkedin/how-linkedin-is-read.md): the browser
  routines, the LinkedIn app on a phone, and that nothing has run against the
  real LinkedIn yet.

### YouTube

- [YouTube](youtube/youtube-module.md): Tyler's answers of 26 Nov 2026, the
  Posts and Comments tabs, New post with three titles, the description
  template, the thumbnail and YouTube's AI question, Shorts, what Post
  refuses, the upload tried once, description templates, the daily reading,
  comments answered with no link, ban screens, and the channel's status.
- [How YouTube is run](youtube/how-youtube-is-run.md): the browser routines
  and their times, the phone steps, the self-test, and that nothing has run
  against the real YouTube yet.

### Messages

- [Messages](messages-dashboard.md): the Projects dashboard's Messages
  section, every account's direct messages, read when a notification says one
  arrived, answered on the right only on a press, and deleted once answered
  or skipped.

### Reddit

- [Accounts](reddit/accounts-dashboard.md): the Projects dashboard's Accounts
  section, every account on every platform with a tab per network and
  Filter (In use or Retired among it), its status, project, profile and proxy, the account on the right
  with its ⋮ and the old window's cards, adding one, setting a status by
  hand, pausing, help-only posts, and retiring.
- [Finding posts worth answering](reddit/finding-posts.md) — what a keyword is,
  watching a subreddit, why there is no Reddit API, how the order is worked
  out, the Everything list, searching the posts, the best posts' replies read
  ahead, the subreddits you never see,
  how old posts are tidied away, searching again by itself every few hours,
  ideas for keywords, and each subreddit's self-promotion thread.
- [Link posts](reddit/link-posts.md) — reading the title and opening of the
  page a post links to, the guard that refuses any address inside the network,
  and how the page is labelled for the AI.
- [Writing the comment](reddit/writing-comments.md) — what the AI is told, the
  subreddit's own rules, the sent comments it copies the voice of, what comes
  back, why Post is sometimes off, checking a comment against the rules,
  rewriting it, what you said before, and ten seconds to undo.
- [What happened to your comments](reddit/sent-comments.md) — Reddit's Sent
  tab on Commenting: every sent comment with its upvotes, its replies and whether it is
  still there, the switch that keeps it out of the AI's examples, removals per
  subreddit, deleting and editing a comment, and the Failed tab.
- [Posts of your own](reddit/your-own-posts.md): New post in the right
  column of a project's Reddit, the subreddit's rules first, the same rules as
  Post, and the Posts and Failed lists.
- [Answering replies](reddit/answering-replies.md) — the Replies window on the
  Sent tab: the replies under a sent comment, drafting and sending an
  answer from the same account under Post's rules, and how an answer is stored.
- [How Reddit sees the account](reddit/account-health.md) — karma, account age,
  and whether a stranger can see the profile, read once a day and on request.
- [Reddit on phones](reddit/reddit-on-phones.md): who is signed in, the health
  reading and the comment done in the real Reddit app, finding a phone
  comment's link, the Post button naming its device, and moving an account
  from a browser profile to a phone.

### Accounts

- [Behaving like a person](accounts/behaving-like-a-person.md) — the reader
  browser that searches so accounts never do, the visit around every comment,
  waking hours, warm-up, the pace limit for young accounts, clicks and
  scrolls like a hand, and help-only comments that build karma. Settings → Behaviour.
- [Important and throwaway accounts](accounts/important-and-throwaway.md): the
  two groups, marking one important for good, and everything Promo refuses
  that would link them.

### The browser

- [The isolated browser](browser/isolated-sessions.md) — Camoufox in a container,
  the pinned image, one identity per profile, checking what a website sees,
  signing in once, the proxy, the limit on how many run at once, profiles
  working side by side, why only the browser program opens one, and how a dead
  or leftover one is cleared.
- [The Jobs window](browser/jobs-dashboard.md): the Jobs button on a
  project's Reddit module. Whether the browser program is running and how to start it, and
  every search, read, comment and check it is running, waiting to run,
  finished or failed, with Cancel and Try again.
- [Browser profiles](browser/profiles.md) — one isolated browser as a record of
  its own, which an account points at, and how the first accounts were adopted.
- [The Anti Detect dashboard](anti-detect-dashboard.md) — Browser profiles,
  Proxies, Racks and Bans as one three-panel dashboard: the Dashboards and
  Projects blocks, Overview's four widgets, each section and its record on
  the right, and the old addresses.
- [The Anti Detect dashboard's Profiles](browser/profiles-dashboard.md) — the table,
  the browser inside the app, a profile's backups and history, folders, labels
  and tags.
- [Backing a profile up](browser/backups.md) — the volume, encrypted with the
  server's key and kept in R2, restoring it here or on another machine, and the
  newest five kept.
- [The Anti Detect dashboard's Proxies](browser/proxies-dashboard.md) — the table, pasting in
  a list, the re-test that reaches every proxy, the dead-proxy notice, the
  record of each proxy's outside address, and what each costs and when it renews.

### Phones

- [Phones and racks](phones/racks-dashboard.md): every phone on every rack
  in the Anti Detect dashboard's Phones, filtered by the Racks block; the rack
  blocks on its left page (Racks, Phones), the Rack program tab in its ⋮, New
  rack with a code made for it, a rack's settings window with its "/" notes,
  the phones list with Filter, saved views and New phone, and the open phone's
  screen and ⋮. Also what a phone holds, its status, the old addresses, and an
  account that runs on a phone.
- [The rack program](phones/rack-program.md): the program at home that drives
  the phones, how it reaches Promo without opening a port, the named actions,
  pairing with a one-time code, signed messages, Disconnect, the one install
  command, and updating itself with a rollback.
- [Jobs on phones](phones/phone-jobs.md): a phone account's jobs through the
  same job list, one at a time per phone and side by side across phones, the
  phones' own limit, waking hours on the phone's clock, an offline phone
  refusing at once, pausing the rack, and Settings → Phones.
- [A phone's screen](phones/screen-window.md): the live picture on the Screen
  tab and the bigger window, asked for only while it is on screen, control
  and the hold while a person taps, authenticator codes and texted codes.
- [A phone's health](phones/phone-health.md): what the rack reads once a
  minute, the bell for a phone offline, hot, with no signal or nearly full and
  for the rack going quiet, the four-week battery and heat chart, and each
  phone's history.
- [Freezes and ban screens](phones/freezes-and-ban-screens.md): a frozen app
  reopened and a frozen phone restarted without anything being sent twice,
  and an app's suspended, locked or "confirm it's you" screen stopping the
  account at once.
- [A picture of every step](phones/step-pictures.md): each action's named
  steps with a screenshot, kept encrypted in R2, how long they are kept, and
  clearing a failed one's.
- [Making each phone look like one person's](phones/looking-like-a-real-person.md):
  the setup check, what the platform sees, wiping a phone between accounts,
  and Wi-Fi phones that must show their proxy's address.
- [The daily self-test and app updates](phones/self-test-and-app-updates.md):
  the spare test phone, walking each action to its last button without
  pressing it, broken actions refused, and app updates on the test phone
  first.
- [iPhones on the rack](phones/iphones.md): a phone's kind, one test phone
  per kind, hourly inbox reads, the iCloud check before a wipe, the one-time
  media link, texted codes off the Messages app, and the WebDriverAgent bell.
- [Seeing the rack](phones/seeing-the-rack.md): a rack's Wall tab of live
  pictures every 5 seconds, the Jobs tabs on a phone and on a rack, filters
  and search kept in the address, the shelf map drawn by slot, and the rack
  program's own log inside Promo.

### Bans

- [Bans](bans.md): Tyler's numbers of 3 Nov 2026, which bans count, the ban
  record, a phone, proxy or SIM an app has flagged and the phones kept off
  it, Clean up, ban pages in every browser, a suspended Reddit reading,
  screens Promo does not know, the kept picture, the app-wide brake, the Bans
  dashboard, each account's history, why it was retired, where it came from,
  counts per app and per project, the Instagram and TikTok warm-up, half
  pace, At risk, throwaway first, the appeal and the weekly look.

### Writing

- [Voices](voices-dashboard.md): the Voices tab on each network of a project's page, how
  the AI sounds and the lines it must not cross, as a record any number of
  accounts share, saved as it is typed, how the
  first account's words moved, and trying a voice on a real post.

### Notices

- [Promo's bell notices](notices.md): new replies, removed comments, suspended
  and shadowbanned accounts, new messages and comments, failures, proxy
  renewals and phone problems, one notice per thing, and where each opens.

### Shell

- [What promo changes about the shell](shell-integration.md) — the options it
  sets, the tables it owns, and the fact that it forks no shell file.
- [Old addresses](old-addresses.md): the pages that only sent an old address
  on are gone since 13 Nov 2026, apart from `/admin/comments`; bell notices
  that held one were moved to the new place, and every link to a phone names
  the Anti Detect dashboard.
- [No success toasts](no-success-toasts.md): nothing pops up when something works, errors and part-done work still say so, Undo bars included.

## From Viral

- [viral-dashboard.md](viral-dashboard.md): Vault, Hooks and Formats, the tabs of the Projects dashboard's Viral row, once rows of Viral's own dashboard.
- [project-page.md](project-page.md): a project's own dashboard, copied from Promo's project page: its page with the fixed Socials and Vault blocks on the left, its ⋮ (General, Socials), the Videos, Hooks and Sounds header with the Keywords dropdown, and the right panels.
- [projects-and-socials.md](projects-and-socials.md): a project, its topic, and the socials added to it like Promo's networks, including X, Reddit and LinkedIn read through Promo.
- [finding-content.md](finding-content.md): YouTube keyword search, followed creators, pasted links, the daily re-check and its bell, the New mark, top comments, sounds, "same idea, other creators", and the YouTube units.
- [sorts-and-score.md](sorts-and-score.md): the twelve sorts, Rising fast, the follower filter, the 0 to 100 score and the Outlier figure.
- [ai-analysis.md](ai-analysis.md): Analyse with AI, what it writes, who writes it (Settings → AI writer), and what it costs.
- [vault.md](vault.md): the vault, its copies of the video, status and tags, the board, copying to another project, saved posts, your own ideas, editing a script, and Download to computer.
- [library.md](library.md): the Hooks and Formats rows: Hooks across every project and your own, hook types and Settings → Hook types, Write hooks like this, and saved Formats that write scripts.
- [storage.md](storage.md): Settings → Storage and the button that deletes downloaded copies nobody opened for 30 days.
- [phone-save.md](phone-save.md): sharing a video to Viral from an Android or iPhone.
- [send-to-video.md](send-to-video.md): Send to Video and the messages between Viral and Video.
- [promo-connection.md](promo-connection.md): reading X, LinkedIn and Reddit through Promo, Write a post for Promo, and Promo reporting your posts back.
- [Shell merges](shell-integration.md): each shell merge into Viral, what arrived and what stays Viral's own.
- [No success toasts](no-success-toasts.md): nothing pops up when something works, and errors and part-done work still say so.
