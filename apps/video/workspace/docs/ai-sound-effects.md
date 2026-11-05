# Sound effects made from words

In the Sounds tab, the + menu has Make a sound with AI. You type what the sound
is, such as "glass shatter", and ElevenLabs makes it. The sound lands on the
timeline at the playhead and stays in Your sounds. Tyler, 4 Nov 2026: "Your
sounds + playhead".

## The window

- **What does it sound like?** Up to 300 characters. Empty is refused with a
  sentence.
- **Length in seconds**, optional. Empty lets ElevenLabs choose. Otherwise
  0.5 to 30 seconds, which is the API's own limit, read on 4 Nov 2026. A
  length outside that is marked and refused with a sentence.
- **The button shows the price** before the press, for example "Make the
  sound · 1¢".

## Where it goes

- **Into Your sounds.** It is saved to the media library as an MP3 named after
  the words typed, and marked as a sound effect
  ([sound-effects.md](sound-effects.md)). After that it is the same as an
  uploaded sound: it plays, drags, adds and comes off the list.
- **Onto the timeline at the playhead**, on the first lane that holds only
  sound and has room there. When no lane does, it gets a new one. It never
  lands on a video's lane or the Ads lane.

## What it costs

ElevenLabs' API price page, read on 4 Nov 2026, lists sound effects at $0.12 a
minute. The same page's questions say they are billed per generation, so Video
prices by the length asked for (`src/lib/video/ai-sound-effects.ts`):

- **A length typed:** the seconds at $0.12 a minute, rounded up to a whole
  cent. A 2 second door slam is 1¢.
- **No length:** priced at the 30 second cap, 6¢, because ElevenLabs may
  choose up to that.

The monthly allowance and the video's spend limit are checked before asking.
Video writes the charge on the AI meter as `ai_sound_effect`, the way AI music
does ([ai-music.md](ai-music.md)). A failed ask is written at 0¢ and keeps
nothing.

## Key and model

The ElevenLabs key is the same one AI music and voices use. The model is
`eleven_text_to_sound_v2`. The server side is
`src/server/video/ai-sound-effects.ts`.

## Not included

Several versions to pick from.
