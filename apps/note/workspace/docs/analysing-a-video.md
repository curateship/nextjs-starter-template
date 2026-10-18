# Analysing a video

The AI runs only when Analyse is pressed, never on its own. Tyler, 17 Oct 2026:
the download happens on paste, and the AI waits for the button "so nothing
spends AI money without him". One button runs everything, and its price is
above it.

## What pressing Analyse does

- **It is allowed** once the video is saved, after it was analysed, and after a
  failure while its file is still there. Pressing twice is one job: a video
  already queued or being analysed comes back as it is.
- **It checks two things first**, so a refusal is said at the button rather
  than later on the card: that a Gemini key is saved ("Save a Gemini key in
  Settings → AI first", or, when the saved key cannot be unscrambled on this
  server, "Paste it again in Settings → AI"), and that this month's AI
  allowance has room ("This month's AI allowance is used up. It starts fresh on
  the 1st.", the shell's own sentence).
- **A video whose file has gone since it was saved**, because an admin deleted
  it from the media library, says so rather than asking to wait.
- **Then it writes `queued` and returns.** The `note-videos` worker picks it up
  on its next tick (see `saving-a-video.md`).

## The two Gemini calls

Both use `DEFAULT_AI_MODEL.gemini` from the shell's `src/lib/ai/ai-models.ts`,
which is Gemini 3.8 Flash. The code never names a model of its own.

**1. Writing the words down** (`transcribe` in `src/server/note/analysis.ts`).
The worker downloads the file to a folder of its own, ffmpeg cuts the sound out
as a mono 16kHz mp3 at 48kbps, and the video itself is deleted straight away.
Thirty minutes of that sound is about 11MB, so it rides inside the request;
anything over 15MB would go up Google's own upload first. Gemini hears the
sound only, never the picture, and is asked for every spoken sentence or phrase
with its start and end in milliseconds, in the language spoken, told how long
the sound is, and told never to repeat a line. The answer is tidied before it
is saved: times are clamped inside the sound and sorted, empty lines and a line
said twice in a row are dropped, and a line with no length is given the time up
to the next one so it can still light up while it plays.

**2. Planning from the words** (`summarise`). A second, text-only call reads
those lines with their times and writes, in English whatever was spoken:

- a summary of 3 to 8 plain sentences,
- an action plan of 3 to 12 steps, each one thing a person could do this week,
  starting with a verb,
- up to 6 of the best lines said, each with the time of the line it came from,
- up to 8 tags, lowercase, one or two words.

Each list is cut to its size rather than failing the answer over one bullet too
many, because by then the words have been paid for. A quote whose time is not a
number, or falls outside the video, is dropped and the rest kept. Every plan
step starts unticked. When nobody speaks, the second call is not made and costs
nothing.

**Every call is metered.** Both go through the shell's `runAiCall`, as
`note_transcribe` and `note_summarise` with the video's id beside them, so the
AI usage screen shows them, the monthly allowance holds, and each call is one
row on the meter.

**The language rule.** The transcript stays in the language spoken. The
summary, plan, quotes and tags come out in English. Tyler, 17 Oct 2026.

## The order of the writes

The words are written first, with the language, and the row moves to
`summarising`. The old summary, plan, quotes and tags are cleared at that
moment, because they belong to the words they were made from. Then the second
answer is written and the row becomes `ready`. **Analyse again replaces all
five and keeps nothing ticked**, and the price line says so before it is
pressed.

## What each card holds

- **Your note**: the person's own words, never touched by the AI.
- **Summary**: the bullets.
- **Action plan**: a checkbox per step. Ticks are saved. The text cannot be
  edited, and there are no follow-up questions or copy-as-text in this build.
- **Key quotes**: each one jumps the player to where it was said.
- **Transcript**: one row per line with its time. Clicking a row jumps the
  player there, and the line being played is lit and kept in view.

Before analysis the four AI cards say "Press Analyse to write the words down
and plan from them." While the job runs they say it fills in by itself.

## The price line

Worked out in the browser from the saved length (`src/lib/note/analyse-price.ts`),
with the prices from the shell's one price list, never typed into the screen:

- the sound in at about 32 tokens a second,
- the words out at about 4 tokens a second,
- the second call reading those words and writing about 1,500 tokens,
- Gemini 3.8 Flash at $0.75 a million tokens in and $3.75 a million out.

**A 30-minute video**: in is 1,800 seconds × 32 + 1,800 × 4 = 64,800 tokens,
which is $0.0486. Out is 1,800 × 4 + 1,500 = 8,700 tokens, which is $0.0326.
Together $0.0812, so the line reads "Analysing costs about 8¢ with Gemini 3.8
Flash." A 60-second TikTok comes to $0.008 and reads "under 1¢". A 12-minute
video reads "about 4¢". Before an upload's length is known it reads "up to 8¢",
the most a 30-minute video can cost. Google's price holds through 31 Dec 2026,
then goes to $1.50 in and $7.50 out, which doubles every figure here once the
shell's price list is updated.

## The bell

Each change rings the owner's bell once, as the shell's `app_activity` kind, so
each person can switch these off in Settings → Notifications:

- "Ready to analyse: <title>" when a link's download is saved,
- "Analysed: <title>" when Analyse finishes,
- "Failed: <title>" with the reason under it, when either fails.

Clicking a notice opens `/videos?open=<id>` with that video picked, on the
Video tab on a phone. The link is kept in `note_notice_links` and handed to the
bell through `notifications.detailsFor` in `src/app/options.ts`.
