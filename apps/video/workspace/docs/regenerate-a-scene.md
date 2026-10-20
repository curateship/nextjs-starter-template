# Make it again

Every clip the AI made remembers how it was made. Right-click it, change the
words, press Make it again, and the new one takes its place: same start, same
length, same lane. Nothing else on the timeline moves, and one Undo brings
the old one back.

The point is the six-fingered hand in scene four. Before this, fixing it
meant making a new picture in the AI clip panel, dragging it onto the
timeline, sliding it into the old one's place and trimming it to size. Now it
is one right-click and a few words such as "hands out of frame".

## Two ways in

- **Right-click the clip** for **Make it again…**. A picture also has Make it
  move…, and a moving clip whose last try failed also has Try again and Clear
  the failed try.
- **The inspector's Make it again card**, under The footage, on any clip the
  AI made (Tyler asked for it on 20 Oct 2026). It says what pressing it does
  and what it costs, such as "for $0.04", and opens the same window.

A clip the AI did not make has neither: an upload, a stock clip, a caption
typed in, or anything laid down before 20 Oct 2026. A guest sent from Project
has neither either, because a guest uses no AI (`project-guests.md`).

The code is `src/components/video-editor/remake-clips.tsx`. The voice line's
swap is `src/lib/video/remake-clip.ts`.

## What a clip remembers

The recipe sits on the clip itself as `origin`, so it travels with the clip
wherever it goes (`src/lib/video/clip-origin.ts`). There are three kinds.

- **A picture** from the AI clip panel's first frames: the direction, the
  picture model, the actor, the actor's pictures it was drawn from, the
  extras, and the shape.
- **A moving clip**: what moves, the picture it started on, the person board
  and backdrop it was sent, the shape and the quality. That is a shot from the
  AI clip panel, or a picture made to move (`animate-a-still.md`). A long shot
  lands as one clip per 8 seconds, and each one remembers its own piece: its
  own words, and the frame it started on.
- **A voice line**: the script as it was written, directions such as
  `[whispering]` included, the voice, the model that read it, and its
  steadiness, expressiveness and speed.

The server writes the recipe, beside the file it hands back. The editor
copies it onto the clip it lays down. These tools write one:

- The AI clip panel, when a first frame or a shot is dragged onto the
  timeline.
- Make it move, on every piece it lands.
- Voice (Read this aloud).
- Hook, when the new opening line is spoken.
- Another language, when the translation is read aloud.

A voiceover laid again from the Voices panel has no recipe, because the shelf
keeps the words and the voice but not the model or the settings
(`saved-voiceovers.md`). Task 08's scenes will write one when that task is
built.

## The window

Each kind has its own fields, and the price is on the button in dollars.

- **A picture:** the picture as it is, its Direction to change, and the
  Model: Nano Banana or Nano Banana 2, with each one's price. "Make it again ·
  $0.04". It says the actor's pictures, the extras and the style line are sent
  with it.
- **A moving clip:** the Make it move window, opened as Make it again. It
  shows the clip, starts with the clip's own words in What moves, and starts
  on the quality the clip was made at. "Make it again · $0.41" for a 4 second
  clip at Normal.
- **A voice line:** What it says, the Voice, and the Quality where there is a
  choice. An OpenAI voice has no models to choose between, and Another
  language always reads with ElevenLabs' multilingual model, so neither shows
  Quality. A short line costs a fraction of a cent, so the button reads "Make
  it again · under $0.01" rather than "$0.00".

The voice window always says how long the line runs now, such as "It runs 3.4
seconds now. A new reading can come out longer. Then the clip grows, and if
the next clip on its lane is in the way, it moves to a lane of its own at the
same start." Nobody can know a reading's length before it is read, so the
warning is there every time.

## What the swap keeps

The new clip keeps the old one's start, length, lane, transition, fades,
fit and colour. It takes the new file's name. Per kind:

- **A picture** gets the new file and the new recipe, and keeps everything
  else, its slow move and its Size included. It is swapped the moment the
  picture comes back, as one Undo step.
- **A moving clip** goes through Make it move's job: the editor asks every 5
  seconds, and the new shot is swapped in when it arrives, or by the
  background worker when no editor is open. The clip keeps its sound settings,
  so a clip that was turned up stays turned up. A picture made to move still
  lands muted, as before. Its speed goes back to normal, because the new shot
  is made at the clip's own length.
- **A voice line** is swapped the moment the reading comes back, with its
  words, as one Undo step.

Who lands a moving shot, and what happens when its clip is deleted or given
another file meanwhile, is the same as for Make it move
(`animate-a-still.md`): the shot waits in the project's Media panel instead.

## A voice line that comes out a different length

The new sound starts where the old one started.

- **Shorter:** the clip is the new length.
- **Longer:** the clip grows. If that runs it into the next clip on its lane,
  the line goes on a lane of its own just below, at the same start, so
  nothing else moves (Tyler, 20 Oct 2026). The toast says so.
- **At another speed:** a line set to play at 1.5x keeps that speed, so the
  clip is the new reading's length divided by 1.5.

Measured on 20 Oct 2026: a 3.4 second line with music starting at 3.5
seconds was read again with a longer script. It came back at 3.6 seconds, so
it moved to a lane of its own. Its three new captions went where the two old
ones were, in the same yellow and the same place on the frame.

## The words that go with a voice line

A caption laid with a voice line names that line (`spokenBy`), so the line
knows which words are its own.

- **From Voice and Another language:** the old captions are taken off and the
  new reading's go on, timed to the new sound and in the old ones' look. They
  go on the lane the old ones were on when they fit, or on a lane of their own
  just above. A line whose captions were all deleted gets none.
- **From Hook:** the new line is shared across the same on-screen words the
  Hook wrote, the way Hook writes it, so the screen and the voice say the same
  thing (Tyler, 20 Oct 2026).
- **Captions edited by hand** are replaced too. Make it again makes the words
  as well as the sound.

Copying a voice line together with its captions keeps the link, pointing at
the copy. A caption copied without its line loses it, so making the original
line again never touches the copy's words, and the other way round.

## When a clip forgets its recipe

- **Replace media** gives the clip another file the AI did not make, so the
  recipe goes.
- **Cutting a voice line** in two, or taking jump cuts out of it, drops the
  recipe from every piece. Reading the whole script again from where one piece
  starts would talk over the other piece.
- **Cutting a picture or a moving clip** keeps the recipe on both halves.
  Either can be made again, and starts from the beginning of the recipe.
- **A moving shot whose starting picture was deleted from Media** while it
  was being made still lands, but the clips it lands as have no recipe,
  because the picture they would start from is gone.

## What it refuses

- **A moving clip over 32 seconds**, the same as Make it move.
- **A second try at a moving clip** while one is being made: "This clip is
  already being made again."
- **A recipe whose pieces have gone:** an actor deleted since, an extra
  deleted since, a picture taken off the actor's sheet, or the picture a
  moving clip started on deleted from Media. Each says which, and nothing is
  made or charged. A moving clip is the one exception for extras, the same
  as any shot (`extras.md`): an extra deleted since loses its words from the
  prompt, and a picture deleted from Media since is left off the board.
- **A voice line with no room for its lane:** a project holds 50 lanes. The
  reading was paid for, so the message says it is in the Voices panel.
- **The usual limits:** the monthly allowance, the project's spend limit, and
  for moving clips the shots-at-once caps (`several-ai-clips.md`).

A remade picture is a new first frame of its own, so it is also in the AI clip
panel's first frames. A remade voice line is on the Voices panel's shelf. A
remade moving shot is on the project's Media panel. Undo never loses any of
them.

## What it costs

The same as making the clip the first time.

- **A picture:** $0.04 on Nano Banana, $0.07 on Nano Banana 2.
- **A moving clip:** about $0.10 a second at Normal, so $0.41 for 4 seconds.
- **A voice line:** by the character, the way each voice provider charges.
  A 67-character line on ElevenLabs' quickest model costs under a cent.

## Where it is kept

- **`origin` on the clip**, inside the project's saved timeline. A clip saved
  before this has none and opens exactly as it did.
- **`spokenBy` on a caption**, naming the voice line that says it.
- **`clip_media_id` on `video_ai_generations`** (migration
  `0128_video_remake_clip.sql`): the file the clip showed when the shot was
  asked for. A moving clip made again starts on its first picture while it
  shows the moving shot, so the starting picture and the clip's file need a
  column each. The shot lands only while the clip still shows that file.
