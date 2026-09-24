# Another language

The AI panel's "Another language" tile translates what is said in a project.
The translation then goes on as captions, or is read aloud by a new voice. One
cut can become a post in Spanish, one in French and one in German without
recording anything again.

## How it goes

1. **Pick a language.** The list has the 29 languages the ElevenLabs
   multilingual voice can speak (`TRANSLATE_LANGUAGES` in
   `src/lib/video/translate.ts`). Anything that can be captioned can also be
   read aloud.
2. **Press Translate.** The window first writes down the talking the same way
   the Captions tool does. It uses the same clip, the longest one with sound
   on a lane that isn't muted. Then it sends the lines off to be translated.
3. **Read it and correct it.** Every line is shown with its time and the
   original words above it. Any line can be edited. Nothing touches the
   timeline until one of the two buttons below is pressed.
4. **Add captions, or read it aloud.** Either one is a single step of undo.

Picking a different language after translating hides the two buttons until
Translate is pressed again. The words already written down are kept while the
window stays open, so a second language only pays for the translation, not for
listening again. Closing the window after a translation asks first, because the
translation has already been paid for.

## Who does which half

| Job | Who does it | Chosen where |
| --- | --- | --- |
| Writing down what is said | Whisper or Gemini | "Who writes it down", the same choice the Captions tool uses |
| Translating | Gemini Flash or GPT-5 mini | "Who rewrites it", the same choice the Hook tool uses |
| Reading it aloud | ElevenLabs, multilingual v2 only | The Voice list in the window |

Only ElevenLabs voices are offered for reading aloud. The OpenAI voices are
left out because the task asked for the multilingual model, and that model
belongs to ElevenLabs. The voice's speed comes from the voice saved as the
usual one in the Voice tool.

## Captions

Each translated line goes on as one caption, at exactly the time of the line it
came from, in the caption look saved in the brand kit. They all land on one new
lane at the top.

A translated caption never lights up word by word, even when the brand kit
switches that on. The word times belong to the original words, and a
translation has a different number of words in a different order.

## Reading aloud

- **Where the voice goes:** on a new lane at the bottom. It starts where the
  first line of talking starts, not at zero.
- **Its captions come with it:** a new caption lane on top, timed to the new
  voice rather than to the original. These captions can light up word by word,
  because ElevenLabs says when each word is spoken.
- **The original stays:** the clip that was written down is not deleted or
  cut. Its volume is turned down to 20% (`TRANSLATE_ORIGINAL_VOLUME`), so the
  new voice is on top and the original can still be heard under it. A clip
  that was already quieter than 20% keeps its own level.
- **One undo takes it all back:** the voice, its captions and the volume change
  come off together, and the original is back at the volume it had.
- **The voice runs at its own pace:** it reads the whole translation as one
  script. A translation that takes longer to say than the original runs past
  the end of the original talking. It is not squeezed to fit.
- **Long scripts:** the voice reads up to 5,000 characters at once. A longer
  translation is refused with a message saying so, before anything is spent.

## When a key is missing

- **No Gemini and no OpenAI key:** Translate says "No Google Gemini key is
  saved — add one in Settings → AI". Nothing can write down or translate
  without one of them.
- **No ElevenLabs key:** the translation still works and can still become
  captions. The voice card says "No ElevenLabs key is saved — add one in
  Settings → AI", and pressing "Read it aloud" shows the same message.

## What it costs

Every call goes through the shell's AI meter, under its own name on
`/admin/ai`.

| Row on the dashboard | What it is |
| --- | --- |
| Caption generation | Writing down the talking, once per window |
| Translation | Each press of Translate |
| Translation voice | Each press of Read it aloud |

At the prices in `src/lib/ai/ai-models.ts`, one minute of talking into one
language costs about:

- **Writing it down:** $0.006 with Whisper.
- **Translating:** under a cent. A 13-second test used 224 tokens in and about
  1,000 out with GPT-5 mini, which is $0.002.
- **Reading aloud:** about $0.14. A minute of speech is roughly 900 characters,
  and ElevenLabs is priced at $0.00015 a character.

The voice is nearly all of the cost. Captions alone come to about a cent a
minute.
