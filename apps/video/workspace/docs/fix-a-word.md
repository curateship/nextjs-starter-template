# Fix a word you said wrong

In the Transcript panel, pick a word or a run of words and press Fix these
words. Type what should have been said, hear it in a copy of the speaker's
voice, then press Apply. Only the sound of those words changes. Tyler, 4 Nov
2026: "Copy of the speaker".

## Using it

- **Pick the words** the way you pick words to cut: click one, shift-click
  another. The window shows the old words crossed out.
- **Say instead:** up to 200 characters.
- **Say it** costs, and plays the new words as soon as they arrive. Hear it
  plays them again.
- **Apply** is free. It swaps the words in as one Undo step. **Say it again**
  makes another take at the same price.
- **Consent:** the window says to use it only on your own voice or with the
  speaker's permission. ElevenLabs' rules require that, and copying somebody
  else's voice without asking isn't something Video should make easy.
- A guest sent from Project doesn't get the button, because it uses AI.

## The copy of the voice

- **Made once per file.** The first fix in a recording sends ElevenLabs
  about a minute of that recording, from where the clip starts, run through
  Clean up the voice first when the clip has it on. ElevenLabs makes an
  instant voice copy from it, with its own background noise removal on.
- **Kept for the file** in `video_media_voice_copies` (drizzle/0154), so a
  second fix in the same recording only pays for the new words.
  Two fixes started at the same moment in a new recording both make a copy;
  the first one kept wins, and the other is deleted at ElevenLabs straight
  away.
- **Needs 10 seconds of sound.** A shorter recording is refused with a
  sentence before anything is sent.
- **Deleted with the file.** Deleting the file from the editor's Media panel
  deletes the copy at ElevenLabs and here
  (`forgetVoiceCopy` in `src/server/video/fix-a-word.ts`). A file deleted
  some other way, such as from the shell's media library, leaves the voice
  at ElevenLabs. The row goes with the file either way.
- **Needs a plan with voice copies.** An ElevenLabs plan without instant
  voice cloning refuses the first fix, and the window shows ElevenLabs' own
  reason.

## The swap

`fixSpokenWords` in `src/lib/video/fix-a-word.ts` does it all as one edit:

- **Where:** the picked words' edges land on the real edges of the speech,
  using the quiet the transcript measured, the same way cutting words does.
- **The clip is cut in three.** The piece under the old words keeps its
  picture with its own sound silenced. The new words go on a sound lane
  under it, the first lane of only sound with room there, or a new lane.
- **No clicks:** a 40 millisecond fade on each side of the new words, and on
  the clip's sound either side.
- **Length:** the picture piece lasts exactly as long as the new words.
  Longer words slow it down, and shorter words speed it up, so the picture
  is held or shortened to match. New words more than four times as long as
  the old ones are refused, because the picture would visibly stutter.
- **Everything after moves.** Every clip on every lane that starts after the
  old words, and every marker after them, moves by the difference. Captions
  and music cues stay where they belong.
- **Captions:** a caption laid over the old words says the new ones. Its words
  after them move by the difference, and the new words share out their time
  evenly. A caption that doesn't hold the old words is left alone.
- **The Transcript panel** still lists the words as recorded, because it
  describes the file, not the timeline.

Worked example: "Tuesday" took 0.5 seconds and "Thursday" comes back 0.8
seconds long. The picture under it plays at 0.625 speed for 0.8 seconds, and
everything after moves 0.3 seconds later.

## What it costs

ElevenLabs charges by the character. The price on the button is
`voiceCostCents` for `eleven_multilingual_v2`, the richest voice model, so the
copy sounds most like the speaker. Making the voice copy adds nothing. The
reading goes on the AI meter as `fix_a_word`, against the video's spend limit.

## Not included

Matching the lips. Lip sync is its own tool ([lip-sync.md](lip-sync.md)).
