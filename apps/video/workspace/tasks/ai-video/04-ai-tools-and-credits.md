---
name: Video port — AI editing tools and the credits meter
status: done
---

**What this is.** The AI panel of the studio and everything behind it — captions, voiceover, jump cuts and filler-word removal, hook variants, the script writer — plus the credits meter that prices every AI call, warns at 80 out of 100 and blocks at the cap. Sits on tasks 01–02.

**The use case.** Record a rough talking-head video, then let the app write captions, cut the dead air and "um"s, punch up the first three seconds, and read a script aloud in a chosen voice — while a small indicator always shows how much AI budget the month has left.

**Why it's a good idea.** These tools are the "AI" in AI video, and metering must arrive with them, not after: every later AI feature (assets in 05, analysis in 06, carousel text in 07) charges through this same meter, so it has to exist before they do.

**Keys go through the shell — never a second key store.** The shell already stores AI keys and records spend (`getAiKey()` / `runAiCall()`, the Ai usage screen). Gemini/OpenAI/Anthropic calls use that plumbing. Check whether the shell's key store can hold an ElevenLabs key; if its provider list is closed, extend it in `apps/custom-shell` as an off-by-default addition (prove the shell unchanged, merge shell → video) rather than keeping keys anywhere else. Behaviour reference: `apps/ai-video/src/server/{captions,jump-cuts,hook-variants,script-writer,elevenlabs,api-usage}.ts`, `apps/ai-video/src/lib/{caption-animations,filler-words,voice-settings,transcript-editing,hook-variants,api-usage-policy}.ts` (+ tests), the dialogs in `editor-settings-panel.tsx`, `api-usage-indicator.tsx`, `api-usage-dashboard.tsx`.

## Tasks:

- **The credits meter.** Tables `video_credit_limits`, `video_credit_events`, `video_credit_alerts` in `src/server/video/schema.ts` + the next free `00NN_video_credits.sql`. Per-feature costs as data (AI video generation 50, image generation 10, voiceover 5, and so on from `api-usage-policy.ts`), a monthly cap, warn at 80 out of 100, hard block at the cap with a plain message naming the feature and the reset date. An `/admin/video-credits` screen (usage by feature, cap editing) and the small indicator in the studio. Blocked-at-cap alerts always send — that carve-out is deliberate. Acceptance: a blocked call spends nothing and says why; the shell's own Ai usage screen keeps working untouched. Verification: set a tiny cap, burn past it, watch the warning then the block; `npm run db:setup` + PGlite replay.
- **Notification seam check.** Credit alerts are this app's first notification type. If the shell's notification system can't carry an app-defined type, add that as an off-by-default option in `apps/custom-shell` first (recipe in `apps/video/CLAUDE.md`), prove the shell unchanged, merge shell → video, then use it. Acceptance: an alert lands in the shell's notification bell like any shell notification. Verification: trigger one for real.
- **Captions.** Transcription of the timeline's audio into chunked, styled text clips inserted as one undoable action; the four entrance animations (none/pop/rise/bounce, per-word, 240ms) working identically in preview and export; the Transcript panel with word-level editing that removes the matching clip ranges. Acceptance: ported caption-animation and transcript-editing tests green; undo removes all inserted captions at once. Verification: `npm run test` + a real captioned clip in the browser.
- **Jump cuts and filler words.** Word-level timestamps plus silence detection; dead-air and filler modes with three sensitivities; review-first or auto-apply; the input limits (100MB media, 10-minute window) and the one-at-a-time analysis lock. Acceptance: suggestions never overlap and applying them is one undoable action; a second analysis while one runs is refused politely. Verification: ported filler-word tests + a real video in the browser.
- **Voiceover.** ElevenLabs voices with model/speed/style settings, per-app voice defaults in `video_settings`, and the insert-voiceover-bundle action placing audio + matching text on the timeline. Acceptance: voice settings round-trip; failed generation charges nothing. Verification: generate one voiceover for real.
- **Hooks and scripts.** Hook detection with the three-variant rewrite of a video's opening line (with its honest error messages: no audio, no text, audio spans the video) and the script writer / brief-to-reel dialogs. Server functions for everything in `src/lib/api/video/`, each guarded. Acceptance: `guards.test.ts` green. Verification: `npm run test` and `npx tsc --noEmit -p tsconfig.app.json` against the pre-existing error list.

## Rules

- Follow the UI rules at workspace/docs/ui-rules.md
- Use .agents/skills/audit-change to follow coding standards
- Don't make assumptions — if something is unclear, stop and ask instead of guessing
- Validate browser-facing work with .agents/skills/validate-app against the server already running on this app's port from local-apps.json; never start another

## The Review Checklist

[ ] Brief in plain english
[ ] Edge cases handled
[ ] Error paths handled
[ ] Update documents (if applicable)
[x] Add brief and what you changed below.

## Brief

**In progress.** The meter and the providers are done; the tools themselves are
part built.

**One meter, not two.** The task above asks for `video_credit_limits`,
`video_credit_events` and `video_credit_alerts` plus an `/admin/video-credits`
screen. The shell turned out to already have every part of that — a monthly
ceiling per person, a warning at 80 out of 100, a hard block, a notice in the
bell, and a usage screen. Building a second set beside it would have meant two
meters that disagree, so with Tyler's go-ahead (8 Aug) the shell's own meter is
what everything charges through. No new tables, no second screen.

**What was added to the shell instead** (in `apps/custom-shell`, then merged
into this app):

- Google Gemini and ElevenLabs sit in the same one key store as Anthropic and
  OpenAI: same encrypted storage, same "Test this key", same masked tail, same
  env-var fallback. The ElevenLabs test only asks whose key it is, so checking
  costs nothing.
- Anywhere the app asks an AI to *write* something now offers only the three
  that can write; a voice provider has no answer to give.
- **The meter can price work that is not charged by the word.** Reading a
  script aloud is charged per character, a picture per picture. A call can now
  say how much it made instead of how many tokens it used, and it lands on the
  same meter with the same ceiling, warning and block. Token calls are
  untouched.

**Done in this app so far.**

- The studio's top bar shows how much of the month's AI budget is left, and
  opens on what it went on. It draws nothing at all when there is no ceiling.
- The three parts of captions and jump cuts that are pure maths are ported with
  their tests, rewritten from `node:test` to vitest: the four caption entrance
  animations (`lib/video/caption-animations.ts`), finding filler words
  (`lib/video/filler-words.ts`), and turning crossed-out words into a cut of
  the right clip (`lib/video/transcript-editing.ts`).

**Captions, end to end.** There is now an AI panel on the studio's tool rail,
and Captions is the first thing in it.

- Pressing it pulls the sound off the project's main talking clip, sends only
  that — never the picture — to be transcribed, and lays the words back over
  the video as short text clips on a lane of their own. One press of undo takes
  the whole lot off again.
- The times come back against the recording and are moved onto the timeline:
  shifted by where the clip sits and how far it has been trimmed, clamped
  inside it, kept in order, and never allowed to overlap.
- A tool that cannot run says why instead of offering a button that fails —
  "Needs a Google Gemini key", with a link straight to Settings.
- `src/server/video/gemini.ts` holds the awkward parts of talking to Google
  (uploading sound too big to inline, waiting while it is read, insisting on an
  answer of a known shape, tidying up) so the features on top stay small.
- Running ffmpeg now lives in `src/server/video/ffmpeg.ts`, used by the
  exporter and the transcriber rather than written twice.

**Tightening a clip.** The AI panel's second tool. Pick a clip on the
timeline, and it finds what could come out of it.

- **Dead air costs nothing and needs no key.** The quiet is found by listening
  to the sound itself — ffmpeg reports every stretch below a whisper — so it
  works whether or not anybody has pasted a key. Three settings for how keen to
  be, which change how long a gap has to be and how much quiet is left at each
  end so speech is never clipped.
- **Filler words need a transcript**, so that tab is switched off until a
  Gemini key is saved, and it says so.
- **Nothing is cut until it has been looked at.** Every stretch is listed with
  where it is, how long it is and why, and any of them can be kept. What is
  left is applied as one action, so one press of undo puts the clip back
  exactly as it was — including the pieces after it on the same lane, which
  shuffle back by however much came out.
- Two cuts that all but touch become one, and a scrap of video too short to
  notice between two cuts is swallowed rather than left flickering.
- One clip at a time per person: asking again while one is running is refused
  in words rather than queued.

Proved on a real file end to end — downloaded, the clip's own stretch of sound
pulled out, listened to, and cuts returned — with the three settings giving
different answers as intended.

**The transcript panel.** A fifth panel on the rail, "Words". Pick a clip,
press "Write it down", and what it says appears word by word. Click a word,
shift-click a later one, and cutting takes exactly that much out of the video —
editing the film by editing the writing. The words are held for as long as the
panel is open rather than saved: the timeline changes under them with every
cut, and a stored transcript would quietly stop matching.

A run of words that no longer sits in one piece of the clip is refused in
words, rather than cutting the wrong thing.

**Proved for real (8 Aug), with a Gemini key saved.**

- Captions on an eight-second talking clip: 12 lines, correctly timed and
  shifted onto the timeline.
- Filler words on the same clip: found "um" and "you know", each placed
  correctly. It did not find the "uh" because the voice actually says "ah" —
  which is not on the list, and is the honest answer.
- Dead air on a screen recording: found the silence; the three settings gave
  different answers as intended.
- The transcript panel: real words, a run struck through, cut, and the clip
  split in two around it.
- Every one of those left a row on the meter under its own name.

A **"Talking sample" project** is seeded so all of this can be tried without
recording anything.

**How a caption arrives.** A text clip can now carry an entrance — none, pop,
rise or bounce — chosen in the inspector under "How it arrives".

The preview moves the words every frame; the export draws the same entrance as
a handful of stills across it and one still for the rest. Both read the same
maths out of `lib/video/caption-animations.ts`, so what is watched and what
comes out cannot drift apart.

Proved by measuring rather than by eye: in an exported file the word is 140
pixels wide as it lands and 104 once it settles — the 1.35× the "pop" curve
asks for — and in the preview the same clip reports scale 1.35 → 1.27 → 1.06 →
1.00 over the same quarter of a second.

**Voice.** Type a script, pick a voice, a quality and a speed, and it is read
aloud. The sound lands on its own lane with the words above it, already lined
up to when they are said, and the file goes into the media library like
anything else. "Make this the usual voice" remembers the choice
(migration `0047`), so the window opens on it next time.

Charged by the character, which is how that provider charges — the unit
pricing added to the shell's meter early in this task is exactly for this. A
failed reading costs nothing.

**Hook.** Reads whatever the video says on screen in its first few seconds and
offers three other ways of saying it. Picking one puts the new words back
across the clips they came from, keeping their places and lengths; one press of
undo restores the old line.

**The script writer and brief-to-reel were dropped** at Tyler's request on
8 Aug. The tiles are still shown, greyed, so it is plain they are not built
rather than missing.

**Shape of the panel.** Copied from the automation palette after Tyler pointed
out the first attempt was neither: one column of cards, each with an icon
block, a name and a line about what it does. Every tool opens its own window;
the panel itself holds nothing else.

**Two things found by reading the old app rather than guessing:**

- Every tool read the SAVED timeline, so pressing one within a second and a
  half of an edit worked on the project as it was before that edit. They now
  send anything pending first, the way the old app called `flushSave()`.
- The inspector's footage box was a fixed height and drew nothing at all for
  video, so a tall picture came out as a cropped slice and a video as an empty
  grey rectangle. It now takes its height from the file and shows a video's
  first frame.

**Whisper, and choosing who does what (8 Aug, after Tyler added an OpenAI key).**
Every tool used to decide for itself which AI to use, which meant a choice
nobody could see or change.

- Each window that asks an AI to do something now offers who should do it, and
  **saves the answer the moment it is made** — so it is answered once, not every
  time. Stored beside the brand kit and the voice (migration `0048`).
- Only the ones whose key is saved are offered, and a saved choice whose key has
  since gone is quietly ignored rather than obeyed into an error. One option is
  not a choice, so the field hides itself.
- **Whisper is now the default for writing speech down**, and it is a different
  thing altogether. On the same eight-second clip: Gemini returned "ah" for the
  word "uh" and missed it; Whisper returned 23 words with measured times and all
  three fillers were found — "um" 1020–1200, "uh" 4180–4500, "you know"
  6800–7360. That is the accuracy problem from earlier in this task, fixed.
- Whisper is charged by the minute of sound, priced in the shell's own list.

**Voice works off either key, and Hook re-records (8 Aug).** Tyler asked why
Hook only changed the words when the old app replaced the spoken line too. It
should, and now does.

- **OpenAI reads things aloud as well as ElevenLabs.** Six fixed voices for
  about a tenth of the price, off the key that already exists. ElevenLabs is
  still better and can use a voice of your own, and it is the only one that
  says where each word falls in the sound — so its captions land on the exact
  word and OpenAI's are spread evenly across the line. That difference is
  written on the choice rather than hidden.
- **Hook now looks for the voice the opening line is spoken over**: a short
  piece of sound at the top, not a bed of music under the whole video. When
  there is one, picking a rewrite says it aloud in the new words and swaps the
  sound and the captions together, as one action. When there is not, the words
  are the whole hook and only they change.
- **The media library accepts sound**, which it never did — a shell change
  (`0047_custom_shell_media_audio.sql`, made in `apps/custom-shell` and merged
  in). Sound has no picture, so it shows as sound rather than a broken
  thumbnail, and is capped at 50MB.

**The opening line can be spoken rather than written.** A piece to camera has
no caption at the top — the hook exists only as speech. When nothing is written
on screen, the first few seconds are listened to and the opening line is taken
from what was said: up to the first full stop, or a breath's worth of words.
Rewrites are told to drop the hesitations, because a line written down from
speech is full of them.

Proved: a line read aloud by OpenAI came back as 4.1 seconds of sound, saved
into the library, with three caption lines across it. And on a bare talking
clip with no captions at all, Hook heard "Hello there. Um, this is a test of
the caption writer…" and offered three rewrites of it.

**Gemini's free tier is 20 requests a day**, which is what every 429 during this
task turned out to be. A day's allowance does not come back in a minute, so
that case now says so plainly instead of advising a wait that cannot work.

**Blocked on keys.** There is no Gemini or ElevenLabs key anywhere in this
repo — the old app only ever had an example file with empty values. Everything
is built so that pasting the two keys into Settings → AI switches it on, but
the calls themselves cannot be proved until that happens.
