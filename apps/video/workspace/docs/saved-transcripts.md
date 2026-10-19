# Saved transcripts

A recording is written down once. The first time Captions, Tighten's filler
words or the Transcript panel needs to know what a file says, the whole file is
sent to Whisper or Gemini and the words that come back are kept. Every later
run on any clip of that file reads the kept words and costs nothing.

Tyler's rule, 18 Oct 2026: "Captions uses the same saved words, so captioning
a clip that was already transcribed costs nothing."

## What is kept

- **One row per file and per transcriber:** the `video_media_transcripts`
  table, made by migration `0120_video_media_transcripts.sql`.
- **The words, timed against the file:** each word with when it starts and
  ends, in milliseconds from the start of the file. Not from the clip and not
  from the timeline. Trimming, splitting, moving or speeding up a clip never
  makes the kept words wrong, because each tool takes the stretch its clip
  plays.
- **How long the file's sound is:** measured when it was written down. The
  price on the buttons reads it ([price-before-you-press.md](price-before-you-press.md)).
- **Whose it is:** the row has no owner of its own. It is only ever read
  through its file, and the file must belong to the person asking
  (`readSavedTranscript` in `src/server/video/transcripts.ts`). A timeline
  edited by hand to name somebody else's file reads nothing.

## Which tools read it

- **Captions:** the stretch the captioned clip plays, cut into lines of up to
  four words and a second and a half.
- **Tighten, filler words:** the clip's stretch. Dead air is found by
  listening for quiet, which never needed words or money.
- **The Transcript panel:** the clip's stretch, with each word placed where it
  plays on the timeline.
- **Another language:** through Captions, so a translation after captions
  pays for the translation only.
- **Hook:** when nothing is written on screen, the first twelve seconds of the
  talking clip come from the kept words if there are some. Without them only
  those twelve seconds are sent, and they are not kept, because twelve seconds
  is not the file.

## Whisper and Gemini

- **Whisper measures, Gemini guesses.** Whisper lines each word up against the
  sound. Gemini estimates when each word was said. So they are kept apart.
- **A Whisper run reads only Whisper's words.** Gemini's guessed times would
  make cuts land in the wrong place.
- **A Gemini run reads Gemini's words, or Whisper's when that is all there
  is.** Whisper's are the better of the two, so paying again for worse ones
  would make no sense.
- **Gemini is asked one question for every tool:** every word, with its
  punctuation, its capitals and the "um"s. Captions use the punctuation and
  Tighten uses the "um"s. Caption lines are cut from Gemini's words the same
  way as from Whisper's.

## Transcribe again

- **Where it is:** the Transcript panel, once a clip's words are showing. The
  button carries its price, for example "Transcribe again · about 2¢".
- **What it does:** writes the whole file down again with whichever
  transcriber is picked, and replaces that transcriber's kept words.
- **When to use it:** when the words came out wrong. Nothing else pays twice.

## Long recordings

- **Up to 30 minutes of sound a file** (`TRANSCRIBE_MAX_SOURCE_MS` in
  `src/lib/video/transcripts.ts`). A longer file is refused before anything is
  sent: "That recording is too long to caption. Captioning covers up to 30
  minutes."
- **Why pieces:** Whisper takes 25 MB a request. The sound goes as 16 kHz mono
  WAV, about 1.9 MB a minute, so one request tops out near 13 minutes.
- **How it is cut:** ten minutes or less goes in one piece. Anything longer is
  shared out evenly, so 25 minutes is three pieces of 8 minutes 20 seconds,
  cut with ffmpeg's `-ss` and `-t`.
- **The overlap:** each piece runs 5 seconds into the next, so a word cut in
  half at the end of one piece is heard whole in the next.
- **The join:** the earlier piece keeps the words that centre before the
  middle of the overlap, and the later piece takes over from there. A word
  heard by both pieces at slightly different times is kept once
  (`joinTranscriptPieces`).
- **One press on the meter:** the pieces go at the same time and come back as
  one row. Whisper bills the overlap too, so 30 minutes is 30 minutes and 10
  seconds of listening, $0.18.
- **Measured on 19 Oct 2026:** a 25-minute talk, the Mac's own voice reading
  these docs, captioned with Whisper. It took 33 seconds, went in three pieces
  and made one meter row of 15¢. It came back as 4,335 words and 1,216
  captions. Around both hand-overs, 8 minutes 22 and 16 minutes 42, the words
  matched the script exactly apart from spellings such as "color". Nothing was
  doubled and nothing was missing.
- **Gemini takes the same pieces.** Its tokens are added up into one row. It
  has only been checked with a stand-in, because the local Gemini key is over
  its allowance.

## What deleting removes

- **Deleting the file from Media** deletes its kept words with it.
- **Deleting a clip or a project** keeps them, because the file is still
  there and the next project to use it should not pay again.

## What it does not do

- **Files written down before this have nothing kept.** Their first run
  writes it.
- **No file in Media is over 100 MB today.** The shell's upload stops a video
  at 100 MB and a sound file at 50 MB, and Viral's downloads stop at 100 MB.
  A 25-minute phone video is usually bigger than that, so a long talk only
  gets this far as a smaller file.
- **Tighten, the Transcript panel and Hook's spoken opening also refuse a
  file over 100 MB themselves** (`JUMP_CUT_MAX_MEDIA_BYTES`), however short
  the clip. Captions and Another language have no size limit of their own.
  Today the two limits are the same 100 MB, so this only matters once the
  shell's upload limit is raised.
