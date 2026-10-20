# B-roll from Pexels

One press reads the project's voice line, cuts it into sentences, asks the AI
that writes words for a short search phrase per sentence, and searches Pexels
(a free stock video library) for each one. A window then shows every sentence
with four clips and a tick on the suggested one. You swap, skip or search a row
again, press Place, and the ticked clips are downloaded into the media library
and laid on a lane of their own, each under the sentence it belongs to.

Literal matching is what makes stock footage look cheap, so the phrase rules and
the review grid are the feature. Pictory, the best-known tool for this, was
rated "generic and incredibly literal", with 20 to 30 picks in 100 needing a
manual swap. The classic miss is a sentence about email "open rates" shown as
somebody opening a letter.

## Where it is

- **The tool:** Video editor → AI tools → **B-roll**.
- **The key:** Settings → **Pexels** (`/admin/settings/pexels`).
- **The code:** `src/components/video-editor/b-roll-dialog.tsx` (the window),
  `src/server/video/b-roll.ts` (sentences, phrases, Place),
  `src/server/video/pexels.ts` (searching, the hourly count, downloading) and
  `src/lib/video/b-roll.ts` (the rules both sides share, with their tests).

## The key

- **Where it goes:** the Pexels tab on the app's settings page. A free key
  comes from pexels.com/api. Pasting it saves it by itself, with no button.
- **How it is kept:** scrambled the same way as the YouTube key, in
  `video_settings.pexels_api_key` (migration `0130_video_pexels_key.sql`). The
  browser only ever sees its last four characters. There is no env var
  fallback.
- **Test this key** sends one search that asks for one result. It counts
  against the hour like any other search.
- **Who can set it:** admins, like the YouTube key. Anyone editing their own
  project can use B-roll once it is set.
- **With no key**, the B-roll window says "Needs a Pexels key" and links to
  Settings → Pexels. It never shows a button that does nothing.

## Which voice line

- **The lane Captions would write from:** the one holding the project's main
  talking clip, the longest sound clip on an unmuted lane, or failing that the
  longest video (`findCaptionSource`). Every clip on that lane is read in
  order. So a brief's scene-by-scene voice, or a voice line cut into pieces,
  comes out as one run of sentences.
- **A voiceover's kept words cost nothing.** A voice line read in the Voice
  window, a brief or the Voices panel carries each word's time on the shelf
  (`saved-voiceovers.md`).
- **Anything else is written down first**, by Whisper or Gemini, the same way
  Captions does it, and kept (`saved-transcripts.md`). That run is metered as
  "B-roll transcript". Captions and Tighten then read the same words for free.
- **Only the stretch each clip plays counts.** A trimmed or sped-up clip takes
  its words from the part of the file it plays, at its own speed.

## Sentences

- **Full stops, question marks and exclamation marks** end a sentence, counted
  before any closing quote.
- **Words with no full stops at all** (Whisper drops them) are cut at every
  pause of 0.4 seconds or more instead.
- **A sentence runs** from its first word's start to its last word's end.
- **Shorter than 1.5 seconds** is joined to the sentence after it, or to the one
  before when it is the last. A joined sentence that is still short is joined
  again.
- **At most 200 sentences**, the searches Pexels allows in an hour. A longer
  voice line is refused with that reason.

## The phrases

One writer call for all the sentences at once, metered as "B-roll phrases"
(`broll_phrases`). The writer gets the project's name and the numbered
sentences, and the prompt is `brollPhrasesPrompt` in `src/server/video/b-roll.ts`.
Its rules, as the task set them:

- **Name the thing the sentence is about, not a word in it.** This is the
  "open rates" miss. The prompt gives that exact example.
- **A concrete scene a camera could film.** "city traffic night", not
  "progress".
- **No faces when the sentence is about a feeling.** A place, an object or
  hands instead.
- **One to three words.**
- **Add the video's main subject when a phrase is ambiguous.** "apple orchard"
  in a farming video, not "apple". The 129,000-star open-source video pipeline
  the task named uses the same "always add the main subject" rule.

When the answer is off:

- **The wrong number of phrases** is asked for once more, naming the miss
  ("Your last answer had 13 phrases for 14 sentences"). A second miss fails
  with "The writer did not give one search phrase per sentence. Try again."
- **A phrase over three words** is cut to its first three. Quotes and full
  stops come off.
- **An empty phrase** becomes the video's subject, which the writer names in
  the same answer.

## Searching Pexels

- **One request per sentence.** 14 sentences are 14 requests. Searching one row
  again is one more.
- **Which way round:** portrait for a 9:16 project, square for 1:1, and
  landscape for 16:9 and 4:3.
- **Four clips a row.** Each search asks for ten results and keeps the first
  four that have a copy at 720p or sharper.
- **The file Place downloads** is the smallest MP4 whose shorter side is at
  least 720 pixels, so a 4K original is never fetched when a 720p copy is
  there. Only files on `videos.pexels.com` are used.
- **The suggested clip** is Pexels' best match that runs at least as long as
  its sentence. When none does, the longest.

## The request budget

- **Pexels' free allowance** is 200 requests an hour and 20,000 a month.
- **The app counts every request of the last hour**, and a batch stops before
  the 201st rather than after Pexels refuses it. The count lives in the web
  process, so a restart forgets it. Pexels' own refusal (HTTP 429) is the
  backstop, and it stops a batch the same way.
- **What a stop keeps:** every row already searched, and the phrases, because
  they were paid for. The rest say "Not searched yet". A line above the grid
  says why it stopped and when to try ("Search the rest, after 3:42 pm"), with
  a Search the rest button.
- **A refused key** stops the batch the same way, and says to check the key.

## The grid

- **One row per sentence:** its start time, its words, the phrase in a box with
  a search button for that row alone, a Skip, and four clips with the
  suggested one ticked. Pressing a clip ticks it instead.
- **A clip plays only while the pointer is over it**, using Pexels' smallest
  copy. An idle grid fetches no video at all.
- **Nothing is downloaded into the library until Place.**
- **The grid is kept for the project** while the page is open, so closing the
  window or switching rail panels loses nothing. Find again pays for new
  phrases.
- **The window credits Pexels** with a "Videos provided by Pexels" link, which
  Pexels' API guidelines ask for wherever its results are shown.

## Place

- **The server downloads each ticked file**, three at a time, only from
  `videos.pexels.com`, never following a redirect, and refusing anything over
  the library's 100MB video limit.
- **Each file is saved to the media library** with the credit as its alt text:
  "Video by Jane Doe on Pexels: https://www.pexels.com/video/123/ (photographer:
  https://www.pexels.com/@jane)". The file's name is "Pexels", the phrase and
  the clip's Pexels number.
- **All or nothing.** If one download fails, the files already saved are
  deleted again and nothing is placed, so Place can be pressed again as it is.
- **One new lane**, straight above the highest lane with pictures or video on
  it, so the clips cover the speaker and any stills and stay under captions
  and text. With no pictures anywhere, straight above the voice.
- **Each clip starts at its sentence's start and runs as long as the
  sentence**, muted, filling the frame.
- **Nothing already on the timeline moves.** The whole placing is one change,
  so one Undo takes every clip and the lane off.
- **A project at 50 lanes** says so before anything is downloaded.

## A clip shorter than its sentence

The clip is held on its last frame, never looped. It is laid at the
sentence's full length, running past the end of its file:

- **The preview** plays the file to its end, parks on its last frame and keeps
  the playhead moving on the clock (`holdsLastFrame` in
  `editor-preview.tsx`). Measured on 20 Oct 2026: a clip whose file ran out 1
  second into a 2.6-second slot stayed on screen, paused near its last frame,
  until the slot ended.
- **The export** draws clips with ffmpeg's `overlay`, which repeats the last
  frame of a clip whose file has run out until the clip's time is up. Checked
  the same day by rendering a run-out clip over a red background: its picture
  was still there 1.4 seconds after the file ended, and the red came back only
  after the slot.

## What it costs

- **The phrases:** a fraction of a cent. The button says it before the press,
  "Find B-roll · about 0.3¢" for a five-second voice line.
- **Writing the voice line down,** when its words are not kept yet, is added to
  the same price.
- **Pexels:** nothing.

## Open question

Pexels asks for a visible credit where practical. Whether the end card should
carry a "Footage: Pexels" line is Tyler's call. Until then the credit lives in
each file's alt text and the link in the window.
