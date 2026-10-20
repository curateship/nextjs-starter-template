# Say what AI made

Every video export carries a short list of the parts the AI made. It shows in
the export's window and copies as one paragraph, ready to paste where YouTube
asks about "altered or synthetic content" or where TikTok asks for its AI
label.

A typical paragraph, from a brief laid end to end:

> Script written with AI and edited by hand. Voice read by AI (ElevenLabs).
> Pictures at 0:00 and 0:03 made by AI (Nano Banana 2) and edited by hand.

## Where it is

- **The export's window:** click an export's name on Exports (or its cog), or
  open it from a project's Exports panel. The Made by AI card sits under
  Words, above Cover picture.
- **Copy as one paragraph** puts the lines on the clipboard as one paragraph,
  each line ending in a full stop.
- **Edited by hand** is a tick, on to start with. It adds "and edited by hand"
  to the script and picture lines, because a person did edit them. It saves
  the moment it changes and is kept for that export only, so ticking it off on
  one export leaves every other export alone. It only shows when there is a
  script or picture line for it to change.
- **A carousel export has no card.** A carousel has no timeline for the
  render to walk.

The code is `src/lib/video/ai-parts.ts` (the walk and the words),
`src/server/video/ai-parts.ts` (the lookups) and
`src/components/video-editor/export-ai-parts-card.tsx` (the card).

## What is listed

One line per part, in this order:

- **The script.** "Script written with AI" when a voice line came from Brief
  to video. "Opening line written with AI" when a voice line came from Hook.
- **The voice.** "Voice read by AI (ElevenLabs)". Lines read by both companies
  share one line: "(OpenAI and ElevenLabs)".
- **Pictures**, one line per picture model, with the time each one starts:
  "Pictures at 0:00, 0:04 and 0:09 made by AI (Nano Banana 2)". Past six
  pictures the line gives the count and the span instead: "12 pictures from
  0:00 to 1:02".
- **Moving clips**, one line per video model, the same way: "Video clip at
  0:12 made by AI (Omni Flash)".
- **A translation** read aloud by Another language: "Translated into another
  language by AI".

Models are named the way the app names them everywhere else (Nano Banana,
Nano Banana 2, Omni Flash, Veo 3.1), never by their model ids. A model the app
has no name for is shown by its id rather than left out.

With nothing made by AI, the card says "Nothing here was made by AI." and has
no Copy button. An export made before 20 Oct 2026 says "This export was made
before the list existed. Export the project again to get one."

## Where it comes from

The render works the list out from the very timeline it draws, at the moment
it starts drawing, and saves it with the finished file. Working it out when
Export is pressed would describe the project as it was then, and the project
can be edited while the export waits in the queue. Try again on a failed
export works it out afresh in the same way.

The walk follows the render's own rules:

- **A clip of no length** is not in the file and is skipped.
- **A voice line nobody hears** (its lane muted, the clip muted, or its volume
  at zero) says nothing about the voice, the script or a translation.
- **A picture or a moving clip on a muted lane** still counts, because muting
  only stops the sound.

Each clip is matched in one of two ways:

- **By its recipe.** A clip the AI made remembers how
  (`regenerate-a-scene.md`): a first frame or a brief's picture, a shot or a
  picture made to move, a voice line from Voice, Hook, Another language or a
  brief.
- **By its file, when it has no recipe.** A first frame or shot dragged in
  from Media, a voiceover laid again from the Voices panel, or anything laid
  down before 20 Oct 2026 carries no recipe. Its file is looked up in the
  tables that made it: `video_first_frames` (a picture and its model),
  `video_ai_generations` (a moving clip and its model) and `video_voiceovers`
  (a voice). A kept voiceover remembers its voice but not its company, so an
  OpenAI voice is recognised by its name (Alloy, Echo and the rest) and every
  other voice is ElevenLabs'.

What it cannot see:

- **Words rewritten with AI and then typed in.** Text and voice lines only
  know they were written with AI when Brief to video or Hook wrote them.
- **A translation laid down as captions only.** The captions carry no
  recipe. A translation read aloud is listed.
- **An actor's picture dragged straight onto the timeline.** An actor's main
  picture can be swapped for an upload, so the actor's model says nothing
  certain about the file.

## Where it is kept

Two columns on `video_render_jobs` (migration
`0131_video_export_ai_parts.sql`):

- **`ai_parts`**, the list as JSON. An empty list means nothing in the file
  was made by AI. Null on exports made before the column and on carousel
  exports.
- **`ai_hand_edited`**, the tick, true unless it is ticked off.

## What the platforms ask for

- **YouTube** has labelled AI video since May 2026 whether or not the
  uploader says so. It says that not disclosing again and again can cost a
  channel the Partner Programme, while a disclosed label "won't limit a
  video's audience or impact its eligibility to earn money".
- **TikTok** has required a label on realistic AI content since 21 Jul 2026.
- **Meta** labels synthetic content nobody disclosed and shows it to fewer
  people.

## Why the voice matters most

YouTube's own checks catch footage from Google's video models. They do not
reliably catch a voice or a script. A voice read by ElevenLabs over real footage looks, to the platform,
like a person talking. So the voice line is the one a platform cannot work out
for itself, and the one most worth pasting.
