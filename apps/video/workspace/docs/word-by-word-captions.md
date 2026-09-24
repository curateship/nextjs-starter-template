# Word-by-word captions

A caption can light up each word as it is said. The line stays on screen as it
always did, and the word being spoken turns a colour of its own, yellow unless
someone picks another. It is off unless someone switches it on.

## Where it is switched on

- **The brand kit.** Brand panel, then Edit brand kit, then the Captions card
  has "Light up each word as it is said" and "Spoken word colour". It starts
  off, so a kit saved before this existed behaves exactly as it did. The small
  sample colours its middle word to show the look.
- **The Captions window** in the AI panel. It shows the same switch, starting
  from the kit, and a change there is for that one run.
- **The Voice window** has no switch of its own. Its captions take whatever
  the kit says.
- **One caption in the inspector.** A caption that knows when its words are
  said shows a "Word by word" card with the switch and the colour. A caption
  typed by hand has no timings, so it shows no card.

## One clip per line, carrying its words

The task offered two shapes: one caption clip that carries its words and their
times, or one clip per word. It is one clip per line, for three reasons.

- **The timeline stays readable.** A minute of talking is about 40 caption
  clips. One clip per word would be about 150 slivers too thin to grab.
- **Undo stays one step.** Changing a caption's colour or size changes one
  clip, not four.
- **Every edit that already works on a caption still works.** Moving,
  splitting, trimming, copying between projects and restyling all act on the
  line and take the word times with it.

## Where the times come from

Every tool that writes captions already knew when each word was said. Until
now it threw that away after cutting the words into lines.

| Who wrote the captions | How good the times are |
| --- | --- |
| Whisper (OpenAI key) | Measured against the sound, word by word |
| Gemini | Gemini's estimates, asked for in the same call as the lines |
| ElevenLabs voice | Measured, from where every letter falls in the sound it made |
| OpenAI voice | None come back, so each line's time is shared out evenly |

- **Punctuation sent as a word of its own** is joined onto the word before it,
  the same way the line's text already joins it. "well" and "," become "well,".
- **When the times do not match the line word for word,** the line's time is
  shared out evenly across its words instead. That happens when Gemini's word
  list and its line disagree. It is a guess, but a guess on the right words.
- **The rules are in `src/lib/video/caption-words.ts`**, with their tests
  beside it.

## What is saved on the clip

- **`wordTimes`:** a start and an end for each word, measured from the clip's
  own start. The words themselves are not saved a second time. The first time
  goes with the first word of the clip's text, the second with the second, and
  so on.
- **`activeWordColor`:** the colour the spoken word turns. Left out, no word
  lights up.
- **A project saved before this** has neither field and draws exactly as it
  did. Its export matches the old one frame for frame, apart from a shade on a
  few pixels where one caption hands over to the next (see "What changes in
  the finished file").
- **Splitting or trimming a caption** moves the clip's trim point, the same one
  a video clip uses, so the right half of a split starts on the word that was
  being said at the cut.

## Which word is lit

- **Nothing is lit before the first word starts.**
- **A word stays lit until the next one starts,** so a pause between words does
  not blink the colour off and on.
- **The last word stays lit** until the caption leaves the screen.

## Editing the words of a lit caption

- **The same number of words:** the times still fit, so fixing a typo keeps the
  lighting.
- **More or fewer words:** the times no longer fit, and the caption draws as a
  plain line. The inspector's Word by word card says so. Putting the same
  number of words back brings the lighting back.
- **Rewriting the opening line with the Hook tool** usually changes the number
  of words, so a rewritten caption usually draws plain.

## How the preview draws it

- **Each word is its own span** inside the caption, numbered, with the spaces
  and line breaks between them kept as typed. A caption with no lighting is
  still plain text.
- **The editor's frame loop colours the lit span.** It is the same loop that
  plays the entrances, and it runs every frame while playing and once on every
  seek (`src/components/video-editor/editor-preview.tsx`).
- **Measured on 23 Sep 2026:** playing a test caption in Chrome, each word lit
  24 milliseconds after its start time on the video's own clock, for all six
  words checked. The task's limit was 100.

## How the export draws it

- **One picture per lit word.** A lit caption is cut into a picture every
  time the lit word changes, with that word drawn in its colour. An entrance
  cuts it further: a few pictures across the entrance, then one per word.
- **All the captions are one layer.** Captions with no picture or video
  between them in the stack are drawn together. There is one full-frame
  picture for each stretch of frames in which the same caption pictures are
  showing, and ffmpeg lays that one layer over the film. The stretches are
  worked out in `src/server/video/caption-layer.ts`, and the text step of
  `buildFfmpegCommand` in `src/server/video/render.ts` draws them.
- **A picture or video between two caption lanes splits them into two
  layers,** so it still sits between them. Checked on 23 Sep 2026 with a
  caption, a picture over it and a caption over that: the stack came out in
  that order, the same as the old exporter.
- **Each change lands on the film's own frames.** A picture starts on the
  first frame at or after the moment it is due. That is the frame that would
  show it anyway.
- **The list is read by ffmpeg's `concat` reader,** counting in the film's 30
  frames a second through an `option framerate 30` line per picture. Older
  ffmpeg than version 5 does not read that line. The live server's version
  was not checked.
- **Line breaks match the preview.** Both wrap at 90% of the frame. See
  [caption-look.md](caption-look.md) for the one case that can still differ.

## Why every caption is one layer

Until 23 Sep 2026 each caption picture was its own ffmpeg input and its own
layer.

- **More than about 90 captions failed outright.** ffmpeg gave every input one
  thread per core, a process may have 4,096 threads, and around the 93rd
  input it stopped with "pthread_create() failed: Resource temporarily
  unavailable". The person saw "The export could not be made".
- **Ten minutes of captions ran out of time.** With fewer threads it got past
  that, but 400 layers over 18,000 frames kept ffmpeg working past its
  ten-minute limit (`FFMPEG_TIMEOUT_MS` in `src/server/video/ffmpeg.ts`).
- **Lit words made both worse,** because a lit caption is four or five
  pictures instead of one.

## What changes in the finished file

- **Almost nothing.** A minute of plain captions came out with 1,789 of its
  1,800 frames exactly the old exporter's.
- **The other 11 frames** are where one caption hands over to the next. The
  exporter has always drawn both on that one frame, the new one on top. They
  are now drawn together in one picture rather than laid on one by one, and
  differ by at most one shade on a few pixels.
- **A minute with the Pop entrance** matched on all 1,800 frames apart from
  compression noise.

## What it costs to export

Measured on 23 Sep 2026 on this Mac: a tall video at high quality, captions
of four words each, one every 1.5 seconds. The old exporter and the new one
took turns so both saw the same machine.

| One minute, 40 captions | Old exporter | New, two runs |
| --- | --- | --- |
| Plain | 11.8, 11.8 | 9.2, 7.0 |
| Every word lit | could not light words | 10.6, 10.9 |
| Pop entrance | 38.7, 36.1 | 11.7, 11.7 |
| Every word lit, with Pop | could not light words | 16.2, 17.0 |

| Ten minutes, 400 captions | Old exporter | New |
| --- | --- | --- |
| Plain | failed after 16 seconds | 62 |
| Every word lit | could not light words | 116 |
| Every word lit, with Pop | could not light words | 217 |

- **Lighting every word adds 2 to 4 seconds a minute,** or under 1 second for
  every 10 captions. That is the time spent drawing the extra
  pictures. ffmpeg's share hardly changes, because it is still one layer.
- **Ten minutes, then the longest export allowed, finished well inside the
  limit.** The heaviest case, ten minutes of lit captions with an entrance,
  took 217 seconds against the 600-second limit. Longer exports now get a
  longer limit ([long-exports.md](long-exports.md)). The machine was busier during that
  run than during the others.
- **Only this Mac was measured.** The live server has a different number of
  cores and may have a different ffmpeg.

## What it does not do

- **Only the colour changes.** The spoken word does not grow, bounce or get a
  box of its own.
- **Captions already on a project are never lit by switching the brand kit on.**
  The kit only shapes captions as they are written, the same as the rest of
  the look.
- **Captions written before 23 Sep 2026 cannot be lit.** They never kept their
  word times, so they show no Word by word card. Writing the captions again
  gives them times.
