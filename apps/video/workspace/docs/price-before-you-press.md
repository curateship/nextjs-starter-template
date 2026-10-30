# The price before you press

The AI buttons in the editor say what a press will cost on the button itself,
for example "Write them · about 2¢". Tyler chose "on the button itself" on
18 Oct 2026. The figure changes the moment another AI is picked in the window,
and it reads "no charge" when nothing will be spent.

Once one of these windows is working, it stays open until the answer lands.
Cancel greys out, and Escape or a click outside does nothing. Closing it used
to leave the request running, so the charge and the captions still arrived
after the window was gone. This covers Captions, Hook, Voice (reading aloud
and Check it) and Jump cuts.

## What each button says

- **Captions, "Write them":** writing down the whole recording behind the
  talking clip, the first time. Once the recording is kept
  ([saved-transcripts.md](saved-transcripts.md)) it reads "Write them · no
  charge".
- **Transcript panel:** "Write it down · about 2¢" the first time, "Show the
  words · no charge" once the recording is kept, and "Transcribe again · about
  2¢", which always pays.
- **Hook, "Show me three":** the writer's share. When nothing is written on
  screen it adds writing down the first twelve seconds, unless the recording
  is kept. When the opening is spoken, each new line also says what reading it
  aloud costs, for example "· read aloud about 1¢", because picking it is a
  second press that pays the voice.
- **Another language, "Translate":** writing down the talking, unless it is
  kept or already in the window, plus translating it. "Read it aloud" carries
  the voice's price, worked out from the real translation.

## How it is worked out

The functions are in `src/lib/video/ai-estimates.ts`. The prices come from the
shell's list in `src/lib/ai/ai-models.ts`, which Video reads and never edits.
It is the same pattern as the Voice window's script check
([script-check.md](script-check.md)).

- **Whisper:** the minutes it will listen to times $0.006, overlap included.
  Four minutes is 2.4¢.
- **Gemini writing down:** 32 tokens for every second of sound in, about
  1,920 tokens of words out for every minute, at $0.75 and $3.75 a million.
  A minute is about 0.9¢.
- **A writer:** the instructions and the words sent, at four characters a
  token, plus what the writer answers with, thinking included. GPT-5 mini's
  answer is measured. Gemini's and Claude's are estimates until a run is
  measured with each.
- **A translation not yet written down:** the lines are guessed from how long
  the talking runs, at 900 characters a minute.
- **A voice:** the characters times that voice's price. ElevenLabs reads with
  the model saved with the usual voice, and an OpenAI voice is priced as
  `gpt-4o-mini-tts`. An OpenAI voice also adds Whisper's minutes for timing
  its words, guessed at 900 characters a minute: 900 characters is 1.35¢ for
  the voice and 0.6¢ for Whisper.
- **What it matches:** the figure is what the AI meter will record for the
  run, and the meter rounds each call to whole cents on `/admin/ai`. So 0.3¢
  shows there as 0¢.

## Checked against the meter

Run on this Mac on 19 Oct 2026, with the OpenAI key.

| Run | The button said | The meter recorded |
| --- | --- | --- |
| Transcript panel, a 4-minute file, Whisper | about 2¢ | 2¢, 4 minutes |
| The same panel again | no charge | nothing |
| Captions on that file | no charge | nothing |
| Captions, a 25-minute file, Whisper | about 15¢ | 15¢, 25.2 minutes |
| Hook, GPT-5 mini | about 0.3¢ | 186 tokens in, 863 out, about 0.18¢ |
| Another language, eight short lines, GPT-5 mini | about 0.7¢ | 210 tokens in, 615 out, about 0.13¢ |

- **GPT-5 mini's thinking figures were set from those two runs:** 900 tokens
  for a hook and 800 for a translation. The Hook button now says about 0.2¢
  for the same run.
- **The translation guess was off on that run** because the 4-minute test file
  has almost no speech in it. Whisper heard "You" eight times. The guess
  assumes four minutes of real talking. Once the lines are in the window the
  figure is worked out from them.
- **Not checked:** Gemini, because the local key is over its allowance; Claude;
  and an ElevenLabs voice read aloud.

## Where it is not shown

- **On a phone.** The editor has no panel rail at phone width, so these
  windows only open on a wider screen.
- **When no key is saved** for any AI that could do the job. The button shows
  its plain label, and pressing it says which key to add.
