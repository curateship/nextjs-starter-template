# Brief to video

You type what a video is about, who it is for and how long it runs. The app
writes a script, cuts it into scenes and shows them as a storyboard with a
price on each. Press Make it, and every scene becomes a still picture with a
slow move, its words read aloud, and captions timed to the words, laid end to
end on the timeline. From there it is an ordinary project.

The point is getting from an idea to a timeline in one sitting. Every other AI
tool in the editor works on something already there.

History in one line: the Script and Brief to reel tiles were dropped on 8 Aug
2026, Tyler picked the idea again on 8 Oct 2026, and on 20 Oct 2026 he asked
for the task to be built, which answered the 8 Aug question.

## Where it is

Video editor → AI tools → **Brief to video**. The tile opens the newest
brief's storyboard when the project has one, and a new brief when it does not.
While scenes are being made, the tile reads "Making scene 3 of 8." instead of
its description. The Script tile beside it is still greyed out.

The code is `src/components/video-editor/brief-to-video.tsx` (the windows and
the editor's landing), `src/server/video/briefs.ts` (the writer, the job and
the worker's landing) and `src/lib/video/brief.ts` (the shapes, the prices and
where scenes land). A guest sent from Project has no tile, because a guest
uses no AI (`project-guests.md`).

## The brief window

- **What it is about:** required, up to 1,000 characters.
- **Who it is for:** optional, up to 300 characters.
- **Platform:** YouTube Shorts, TikTok, Instagram Reels or YouTube.
- **Length in seconds:** 15 to 180 on the first three, and up to 1,800 (the
  project's 30-minute cap, `long-exports.md`) on YouTube. Switching to a short
  platform brings a longer length down to 180.
- **Voice and voice quality:** the window opens on the voice and settings
  saved with "Make this the usual voice" in the Voice window. Quality only
  shows for an ElevenLabs voice.
- **Picture model:** Nano Banana 2 at $0.07 a picture, or Nano Banana at
  $0.04. Nano Banana 2 is the default, as the task said unless Tyler chose
  otherwise.
- **The project's look:** the window says whether the pictures will be made
  in the project's style line (`visual-style.md`).
- **The price before the press:** "Write the script · about 1¢", and a line
  saying which writer it uses. It covers the script and its check.

## What the writer is asked

One call to whichever AI writes words (`writing-with-ai.md`), metered as
"Brief script" (`brief_script`). The prompt is `briefPrompt` in
`src/server/video/briefs.ts`. In plain words, it asks for:

- **The shape:** a title, the hook line, then scenes, each with the words
  said, one sentence of picture direction, and how many seconds it runs.
- **Open on the hook:** the first scene starts with it. Its first sentence has
  four words or fewer before the first comma or full stop. That is the script
  check's own one-second rule, from Jenny Hoyos in YouTube's write-up on
  Shorts.
- **No greeting:** no "welcome to this video", "in this video", "hey guys".
- **For a Short, TikTok or Reel:** foreshadow the payoff, turn with a "but",
  deliver with a "then".
- **A question or a promise every thirty seconds of speech**, counted from the
  start. That is the script check's "keep them watching" rule.
- **170 words a minute**, so the seconds add up to the asked length. That is
  the middle of the 160 to 180 a minute Shorts narration is read at.
- **Plain spoken words:** no markdown, no "Narrator:", numbers written as
  words, and none of the banned words on Settings → Scripts.
- **Picture directions say what is seen**, never what is said, and never any
  text in the picture. Each scene's picture is a different shot from the one
  before.
- **Scene length:** 3 to 8 seconds for a short platform and 5 to 15 for
  YouTube, at most 120 scenes.

The first real brief, on 20 Oct 2026, was written before the hook and
thirty-second rules were spelled out the checker's way. Its opening ran nine
words to the first comma and its thirty seconds had no question, and the check
caught both. The prompt was changed the same day to match the checker word for
word.

### When the answer is wrong

- **A malformed answer** (empty, not JSON, or missing a field) is asked for
  again once. A second malformed answer fails with the provider's message.
  A missing key or a refused call is not asked again.
- **Wrong length:** scenes adding up to more than a tenth away from the asked
  length are asked for once more, with the shortfall named ("Your last
  answer's scenes added up to 20 seconds, but the video must run 45 seconds").
  The second answer stands whatever its length, and the storyboard says how
  long it runs against the ask.
- **The script check** (`script-check.md`) runs on all the scenes' words
  together, at the voice's speed. Its findings sit above the scenes. If the
  check itself fails, the storyboard says why and keeps the script, because
  the script was already paid for.

## The storyboard

A window with the brief, the script check, then every scene:

- **Each scene:** its words, its picture direction and its seconds, all
  editable, a remove button, and its price: "Picture $0.07 · Voice $0.01".
- **Add a scene** puts an empty one at the end. A brief holds 1 to 120 scenes.
- **The total** is on the Make it button and under the scenes, and changes
  with every edit. A voice is charged by the character, so a few words more
  can move the total by less than a cent, which the dollars round away.
  Removing or adding a scene always moves it.
- **Nothing is made or charged until Make it.** The window says so.
- **Edits are kept 700ms after typing stops**, so closing the window or
  reloading the page loses nothing. A scene with no words or no picture
  direction waits until it has both, and Make it says which scene is missing
  what.
- **Seconds are the plan, not the length.** The reading decides how long each
  scene really runs. The window says "The scenes add up to 29 seconds,
  against the 30 asked. The reading decides the real length."
- **New brief** at the foot starts another. When a project has several
  briefs, a Brief picker at the top lists them by title and date.

## Make it

The editor saves first, then hands every scene to a background job
(`briefTick`, every 15 seconds). The job makes each scene in order:

1. **The still:** the picture direction, in the project's look, filling the
   frame, with no text. It is a 9:16 or 16:9 picture: the project's own
   shape, or for a square or 4:3 project the nearer one (9:16 for square,
   16:9 for 4:3).
2. **The voice:** the scene's words read aloud with the brief's voice and
   settings. ElevenLabs hands back each word's timing, which the captions are
   built from. An OpenAI voice is timed by Whisper straight after
   ([word-by-word-captions.md](word-by-word-captions.md)).

Each one is held to the project's spend limit just before it is asked for, so
a limit reached halfway stops the brief there.

### Where it lands

- **The start:** at the playhead when the timeline is empty, otherwise
  straight after the last clip. It is settled when Make it is pressed, so
  nothing already on the timeline moves or is covered.
- **Scene after scene:** each scene starts where the voice before it ended,
  plus a 200ms breath.
- **The still** runs as long as its voice and the breath, so the pictures meet
  end to end. It takes the next slow move in turn: push in, drift right, push
  in, drift left (`clip-motion.md`). No two neighbours move the same way.
- **The voice** sits under it and the **captions** over it, in the standard
  caption look (`caption-look.md`). Each caption names the voice line that
  says it.
- **Three lanes of the brief's own:** words at the top, pictures under them,
  voice at the bottom. A new project's three empty lanes are used first. A
  lane that was deleted, or that has something dropped where the next scene
  goes, gives way to a new lane beside it.
- **The files go on the project's Media panel**, so an Undo never loses one.

Measured on 20 Oct 2026, on an empty project with the playhead at 0: scene
one's picture ran 0 to 3.776 seconds over a 3.576 second voice line, and scene
two started at 3.776 with a drift right. That run used a library picture and
two saved voiceovers standing in for the worker's output, because the local
Gemini key is a free key (see "What has not been run").

### Who lays the scenes

The same two ways as Make it move (`animate-a-still.md`):

- **An editor open on the project** asks every 5 seconds while scenes are
  being made, and lays each made scene itself as one Undo step. It says
  "Scenes 1 to 2 are on the timeline. Undo takes them off."
- **With no editor open,** the background worker lays them and saves the
  project in the same step.
- **Only one of the two lays a scene.** The editor tells the server first; a
  scene the worker already laid is passed over.

Closing the tab never stops a brief, and a reload loses nothing: every scene's
progress is kept on the server.

Undo after a landing takes those scenes off the timeline. They count as laid,
so they are not laid again, and scenes made after it still land in their own
place, leaving the gap. Redo puts them back.

## When a scene fails

- **The brief stops at the failed scene.** The scenes before it are on the
  timeline. The scenes after it wait, because each one starts where the one
  before it ended.
- **The storyboard shows the reason** under the scene, cut to its last whole
  sentence, with **Try again**. The window's description names the scene that
  failed.
- **Try again makes only what is missing.** A picture made before its voice
  failed is kept, so it is never paid for twice. The scenes after it carry on
  behind it.
- **A failed call costs nothing.** The meter records a call only when it
  answers.
- **A worker stopped mid-scene** leaves a lease that runs out after five
  minutes. The next pass picks the brief up at the scene it was on, keeping
  any picture already made. A voice read in the moment before the stop is in
  the Voices panel but not on the scene, and is read again.

## Making a scene again

Every picture and voice line a brief lays remembers how it was made
(`regenerate-a-scene.md`). Right-click either one, or use the inspector's
Make it again card.

- **A picture** is made again from its direction and the project's look, with
  no actor. The new picture goes on the Media panel, not the AI clip panel's
  first frames. "Make it again · $0.07".
- **A voice line** is read again with the same voice and settings, and its
  captions are replaced with the new reading's. A shorter reading leaves a
  short gap before the next scene; the picture keeps its length.
- **Make it move** works on a scene's picture like any other picture
  (`animate-a-still.md`).

## What it costs

- **The script and its check:** about 1¢ for a 30 second Short with GPT-5
  mini, worked out by `briefScriptCostCents` in `src/lib/video/ai-estimates.ts`.
- **One scene:** a picture and a reading. On Nano Banana 2 with ElevenLabs'
  Best voice, an 83 character line is $0.067 + 83 × $0.00015 = $0.067 +
  $0.012, about $0.08.
- **A whole Short:** the first real brief, six scenes for 30 seconds, priced
  at $0.50 on the storyboard.
- **Reopening a storyboard costs nothing.** It is read from the database.

## Where it is kept

The `video_briefs` table (migration `0129_video_briefs.sql`), one row per
brief, owned by the person and pointing at the project:

- **The brief:** what it is about, who it is for, length, platform, voice and
  picture model.
- **The script:** the title, the hook, and the scenes as one list. Each scene
  has its words, picture direction, seconds, where it is up to (draft,
  queued, made, placed or failed), the reason it failed, and the picture and
  reading made for it.
- **The check:** its answer, or why it could not be run.
- **The landing:** where scene one starts and the three lanes, once set.
- **The job's lease**, so only one worker makes a brief at a time.

Deleting the project or the person deletes their briefs. The pictures and
readings stay in Media like any other file.

## What has not been run

- **No real picture.** The local Gemini key is a free key and Google refuses
  every picture on it ("You exceeded your current quota"). The script, the
  check, the storyboard, Make it, the failure, Try again, the editor's
  landing, Undo, and Make it again on a voice line were all run for real on
  20 Oct 2026. The landing used stand-in files, as described above.
- **Nano Banana (`gemini-2.5-flash-image`)** is still offered in the picture
  list. The task file says Google shut it down on 2 Oct 2026; nobody has
  checked that with a paid key.
