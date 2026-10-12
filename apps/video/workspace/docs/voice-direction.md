# Voice direction and your own voice

The Voice window can be told how to say things, it remembers how steady and how
expressive the voice should be, and it can read in a voice made from your own
recording. All three work through ElevenLabs.

## The models

The Quality list in the Voice window has six ElevenLabs models. Only the last
three follow directions.

| Quality | Model | Price per 1,000 characters | Follows [tags] |
| --- | --- | ---: | --- |
| Best | `eleven_multilingual_v2` | $0.15 | No |
| Quicker | `eleven_turbo_v2_5` | $0.075 | No |
| Quickest | `eleven_flash_v2_5` | $0.075 | No |
| Eleven v4 | `eleven_v4` | $0.08 | Yes |
| Eleven v4 Turbo | `eleven_v4_turbo` | $0.04 | Yes |
| Eleven v3 | `eleven_v3` | $0.08 | Yes |

- **Where the prices come from:** the v3 and v4 rows are ElevenLabs' list
  prices on elevenlabs.io/pricing/api, read on 12 Oct 2026, the day v4's launch
  price of $0.022 ended. The three older rows are the app's earlier estimates
  and were not changed.
- **What a read costs:** a 1,000-character script on Eleven v4 Turbo is 4
  cents. The same script on Best is 15 cents.
- **What is counted:** every character sent, tags included. `[whispering]` is
  12 characters.
- **Where the prices live:** `src/lib/ai/ai-models.ts`, a shell file. The rows
  were added in Custom Shell first and copied here unchanged.

## Directing the voice

- **A tag:** a word or a few words in square brackets before a phrase, such as
  `[whispering]`, `[excited]` or `[sighs]`. It lasts until the next tag. Any
  short bracketed words are passed on, because ElevenLabs keeps adding tags.
- **What counts as a tag:** 1 to 40 characters between `[` and `]` on one line.
  Longer writing in brackets is read out as it is.
- **A pause:** the "Add a pause" button under the script box puts `[pause 1s]`
  where the cursor is. The length is picked beside it, from half a second to
  three seconds. A typed `[pause 9s]` is held to three seconds.
- **Ten pauses at most:** ElevenLabs says too many breaks make the voice speed
  up or add noises. An eleventh pause marks the script box red, says how many
  to take out, and Read it aloud refuses until they are gone.
- **Run length and Check it:** both see only the words that are said. The line
  under the box adds up the pauses separately, for example "2 pauses, 3.5
  seconds in all".

## How the script is sent to each model

`scriptForReader` in `src/lib/video/voice-direction.ts` turns the script into
what the chosen model understands, just before it is sent.

- **Eleven v3 and v4:** tags are sent as written. A pause becomes an ellipsis
  and a line break, because these models do not take `<break>`. The voice times
  that pause itself, so `[pause 2s]` and `[pause 0.5s]` sound alike. The window
  says so under the pause count.
- **Best, Quicker and Quickest:** tags are taken out, because these models
  would read "whispering" aloud. A pause becomes `<break time="2s" />`, which
  they follow to the second. The window says the tags will be left out.
- **OpenAI voices:** tags are taken out, and a pause becomes an ellipsis and a
  line break.

## Captions never show a tag

ElevenLabs times every character it was sent, tags and breaks included.
`alignmentToWords` in `src/lib/video/voice.ts` skips anything inside square
brackets or a `<break ... />`, and drops an ellipsis standing on its own. A
lone `[` or "3 < 5" in the script is ordinary writing and stays.

The voiceover shelf keeps only the words said. A read of "[whispering] I found
something. [pause 1s] It changes everything." on 12 Oct 2026 was kept as "I
found something. It changes everything." with the captions "I found
something.", "It changes" and "everything.".

## Steadiness and expressiveness

Both sliders sit under Speed in the Voice window. OpenAI voices have neither,
so the sliders hide when one is picked.

- **Steadiness:** ElevenLabs' stability, 0 to 1, starting at 0.5. Low is
  livelier and changes from one read to the next. High is even and flat.
- **Steadiness on v3 and v4:** Eleven v3 refuses anything but 0, 0.5 or 1, so
  the value is rounded to the nearest of those for v3 and v4. v4 is treated the
  same because a refused value would cost a failed read. ElevenLabs' docs do
  not say whether v4 has the same limit.
- **Expressiveness:** ElevenLabs' style, 0 to 1, starting at 0. The window says
  beside it that ElevenLabs calls more of it "more prone to hallucinations",
  meaning words or sounds that were not in the script.
- **Settings that stick:** "Make this the usual voice" saves the voice, the
  quality, the speed, the steadiness and the expressiveness together in
  `video_settings.voice_defaults`. A voice saved before 12 Oct 2026 has no
  steadiness or expressiveness and reads with 0.5 and 0.
- **Hook and Another language:** both read with the saved steadiness and
  expressiveness, through `rememberedVoiceSettings`. With nothing saved they
  send no settings, and ElevenLabs uses the voice's own.

## Your own voice

The Voices panel on the editor's left rail starts with "Your voices": the
voices made from your recordings, a play button for each recording, a delete
button, and New voice, which opens "Make a voice of my own".

- **The window:** record from the microphone, or upload an MP3, WAV, M4A, OGG
  or WebM file, then name the voice and press Create voice.
- **Whose voice:** the window says the recording must be your own voice, or
  the voice of someone who has agreed to have it copied.
- **Length:** 10 to 60 seconds. A recording stops itself at one minute. The
  window checks the length as soon as it knows it, and the server checks again
  by reading the sound with ffmpeg. A 3-second take shows "The sample runs 3
  seconds. It needs 10 to 60 seconds of speech."
- **Size:** 25 MB at most. A minute of studio-quality WAV is about 17 MB.
- **What ElevenLabs does:** an instant clone, made in seconds, sent to
  `POST /v1/voices/add`.
- **Where it shows:** first in the Voice window's list, marked "(yours)". It
  is used like any other voice, with any model.
- **Who sees it:** only the person who made it. Every voice sits on the app's
  one ElevenLabs key, so the list hides voices made by other people, and a
  read with someone else's voice is refused. A voice made on the ElevenLabs
  site has no owner here and everybody still sees it.
- **Where it is kept:** a row in `video_cloned_voices` (migration 0109) with
  the ElevenLabs voice id, the name, the owner and the recording's media id.
  The recording is an ordinary sound file in the media library.

### What a voice of your own costs

- **Making one:** nothing per voice. ElevenLabs only makes instant clones on a
  paid plan. When the key's plan refuses, the window says "ElevenLabs only
  makes voices on a paid plan" followed by ElevenLabs' own sentence.
- **Reading with one:** the same price per character as any other voice on
  the model picked.
- **A failed attempt:** charges nothing and leaves nothing behind. Any refusal
  shows ElevenLabs' own words after "ElevenLabs said:". Making a voice is not
  on the AI meter, because ElevenLabs does not charge for it.
- **How often:** 10 attempts an hour per person.

### What deleting one removes

- **At ElevenLabs:** the voice, deleted first. If ElevenLabs will not delete
  it, nothing here changes and the window says why.
- **Here:** the `video_cloned_voices` row, so the voice leaves the list.
- **What stays:** voiceovers already read in it keep playing, because they are
  ordinary sound files. The recording stays in the media library.
- **The confirm says so** before anything is deleted.
- **Deleting an account** deletes its rows but not the voices at ElevenLabs.
  Those are then visible to everybody on the key, like a voice made on the
  ElevenLabs site.

## Not yet checked for real

- **A real clone:** the window, the recording and the refusals were run in a
  browser, and the clone call was tested against a stand-in for ElevenLabs. No
  voice has been made on the real account, because it needs a real person's
  recording.
- **The paid-plan sentence:** ElevenLabs does not publish the exact refusal for
  a plan without cloning. The window looks for "plan", "subscription",
  "upgrade" or "voice_cloning" in the answer.
