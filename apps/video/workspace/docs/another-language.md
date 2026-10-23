# Another language

The AI tools panel's "Another language" tile translates what is said in a project.
The translation then goes on as captions, or is read aloud by a new voice. One
cut can become a post in Spanish, one in French and one in German without
recording anything again, and several languages can be made in one press
(see "Several languages at once" below).

## How it goes

1. **Tick a language.** The list has the 29 languages the ElevenLabs
   multilingual voice can speak (`TRANSLATE_LANGUAGES` in
   `src/lib/video/translate.ts`). Anything that can be captioned can also be
   read aloud. Spanish is ticked when the window opens. Ticking one language
   works on this project, as below; ticking more makes copies.
2. **Press Translate.** The button says what it will cost, for example
   "Translate · about 3¢" ([price-before-you-press.md](price-before-you-press.md)).
   The window first writes down the talking the same way the Captions tool
   does. It uses the same clip, the longest one with sound on a lane that
   isn't muted, and the recording's kept words when it has them
   ([saved-transcripts.md](saved-transcripts.md)). Then it sends the lines off
   to be translated.
3. **Read it and correct it.** Every line is shown with its time and the
   original words above it. Any line can be edited. Nothing touches the
   timeline until one of the two buttons below is pressed.
4. **Add captions, or read it aloud.** Either one is a single step of undo.

Picking a different language after translating hides the two buttons until
"Translate into French" is pressed. The words written down are kept with the
recording, so a second language, or a second visit to the window, only pays for
the translation, not for listening again. Closing the window after a
translation asks first, because the translation has already been paid for.

A translation takes up to 1,000 caption lines (`TRANSLATE_LINES_MAX` in
`src/lib/video/translate.ts`). A minute of talking is about 40 lines, so that
is about 25 minutes, while Captions goes up to 30.

- **What a longer talk gets:** "This project has more than 1,000 caption
  lines, which is as many as one translation takes", and nothing is sent to
  the writer.
- **What it has already paid for:** writing the recording down, which comes
  first. Those words are kept, so Captions on the same recording is then
  free.

## Several languages at once

Tick up to 10 languages (`TRANSLATE_LANGUAGES_AT_ONCE`, the same cap a
carousel's copies have). Each one becomes a copy of this project with its own
voice, its own captions and its own export. Tyler chose copies over one
project holding a voice per language on 21 Oct 2026. This project is never
changed.

1. **The price shows under the list**, for a short clip for example "Each
   language costs about $0.04: its translation and its voice. 3 languages come
   to about $0.12." It is a guess
   from the talking until the lines are in. Writing the talking down is paid
   once for all of them.
2. **Translate into 3 languages** writes the talking down once and translates
   it into each, one after another. A language that fails is named in the
   message; the rest are kept, and the button then offers that one again.
3. **Read each one.** Every language has a tab holding its lines, each under
   its time and the words it came from, to read and correct. A tab counts as
   read once it has been opened; the first is open already. A read tab shows a
   tick.
4. **Make all 3** says what the voices will cost. It is refused in words until
   every tab has been opened, naming the ones still to read: "Read Portuguese
   and Hindi first. Open each of their tabs, so every translation is read
   before it is made". Nothing is sent until then.
5. **Each language is made in turn** (`makeLanguageCopyOf` in
   `src/lib/api/video/ai-tools.ts`, `src/server/video/language-copies.ts`).
   One voice, the one picked in the window, reads every language. For each:
   - **The voice is read** from that language's corrected lines, and kept in
     the Voices panel like any voiceover.
   - **The copy is made** from this project as it is saved at that moment,
     named "My Short (Spanish)". A long name gives way at its end so the
     language always fits.
   - **It is laid the way the one-language tool lays it:** the voice on a new
     lane at the bottom from where the talking starts, its captions in the
     saved caption look on a new lane at the top ([caption-look.md](caption-look.md)),
     and the original talking turned down to 20%.
   - **Its export is queued** in the project's own shape, at the Export
     window's starting settings (Best, 30 frames a second, sound evened out),
     named like the copy.
6. **The window then lists what was made**, each copy linked, with "Export
   queued" or the reason it was not. A language that failed says why and gets
   a "Try Hindi again" button, which makes only the ones that failed.

What holds and what does not:

- **The copy is checked before the voice is paid for:** the project is yours,
  its timeline reads, the talking that was translated is still on it, the new
  voice would start before the project ends, two more lanes fit, and its
  export would be taken (the project is not empty or too long, and the export
  queue has room for one more). A copy whose talking has gone since is refused
  with "The talking this was translated from is no longer on the project.
  Translate it again". A full queue is refused with the Export window's own
  words, so ten languages with twelve exports already waiting make eight
  copies and refuse the last two without paying for their voices.
- **The copy stands even when its export is refused** after it is made, for
  example when other exports filled the queue while the voice was read; the
  window says so, and the copy can be exported from the editor.
- **Stopping one export leaves the others going.** Each copy is a project of
  its own, so its export is a job of its own.
- **The copy remembers its original** in `video_projects.language_of` and its
  language in `video_projects.language` (`drizzle/0141`). Deleting the original
  blanks the link; the copy stays. A copy made from a copy remembers the first
  original, so "My Short (Spanish) (French)" is listed under "My Short". Its
  name says Spanish too because it still carries the Spanish voice.
- **Capitals in Turkish:** with a capitals look, Turkish captions are put in
  capitals the Turkish way, so "istanbul" is "İSTANBUL". Every other language
  on offer writes capitals as English does.

- **Six languages export as empty boxes.** The five fonts the export draws
  with (`src/server/assets/`) have no Arabic, Chinese, Hindi, Japanese, Korean
  or Tamil letters, so captions in those languages come out as "NO GLYPH"
  boxes in the file, though the editor's preview shows them. Checked on
  22 Oct 2026 by drawing each script with the export's own renderer. This was
  already true of one-language captions; Make all queues those exports by
  itself. The voice is not affected.

### On the Exports page

The exports of an original and its language copies sit together under one
grey heading row, "My Short, and Spanish and Hindi", in the order the list is
sorted, at the place the group's first row would sort to
(`src/lib/video/export-groups.ts`). Each language's row says its language
under its name. Tyler chose heading rows over sorting alone on 21 Oct 2026. A
copy whose original was deleted is listed on its own, without a heading.

## Who does which half

| Job | Who does it | Chosen where |
| --- | --- | --- |
| Writing down what is said | Whisper or Gemini | "Who writes it down", the same choice the Captions tool uses |
| Translating | Gemini Flash, GPT-5 mini or Claude Opus 5 | "Who rewrites it", the same choice the Hook tool uses (see [writing-with-ai.md](writing-with-ai.md)) |
| Reading it aloud | ElevenLabs, multilingual v2 only | The Voice list in the window |

Only ElevenLabs voices are offered for reading aloud. The OpenAI voices are
left out because the task asked for the multilingual model, and that model
belongs to ElevenLabs. The voice's speed comes from the voice saved as the
usual one in the Voice tool.

## Captions

Each translated line goes on as one caption, at exactly the time of the line it
came from, in the caption look saved on Settings, Captions. They all land on
one new lane at the top.

A translated caption never lights up word by word, and keeps its own length
whatever the look's "Words at a time" says. The word times belong to the
original words, and a translation has a different number of words in a
different order.

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
| Caption generation | Writing down the recording, once, then kept |
| Translation | Each press of Translate |
| Translation voice | Each press of Read it aloud |

At the prices in `src/lib/ai/ai-models.ts`, one minute of talking into one
language costs about:

- **Writing it down:** $0.006 with Whisper.
- **Translating:** under a cent. A 13-second test used 224 tokens in and about
  1,000 out with GPT-5 mini, which is $0.002. The same lines with Claude Opus 5
  come to about $0.026, plus whatever thinking it is billed for.
- **Reading aloud:** about $0.14. A minute of speech is roughly 900 characters,
  and ElevenLabs is priced at $0.00015 a character. The "Read it aloud" button
  says the price for the real translation before it is pressed.

The voice is nearly all of the cost. Captions alone come to about a cent a
minute. Several languages cost that much each: three languages of a minute of
talking come to about 3 × ($0.002 + $0.14), which is about $0.43, plus the
$0.006 of writing it down once.
