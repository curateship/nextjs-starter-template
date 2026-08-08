---
name: Video port — AI editing tools and the credits meter
status: in progress
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

**Still to do.** Transcription itself and inserting the caption clips, the
transcript panel, the jump-cut window, voiceover, hooks and the script writer.

**Blocked on keys.** There is no Gemini or ElevenLabs key anywhere in this
repo — the old app only ever had an example file with empty values. Everything
is built so that pasting the two keys into Settings → AI switches it on, but
the calls themselves cannot be proved until that happens.
