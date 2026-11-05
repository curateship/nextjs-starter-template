# Analyse with AI

Analyse with AI on the right panel turns a viral video into four pieces Tyler
picked on 4 Nov 2026: "Why it works", "Script for my topic", "3 to 5 more
ideas", "Title + hashtags" (`src/server/viral/ai-analysis.ts`).

## What happens when you press it

1. **The download.** The video is downloaded into Viral's storage, if it
   isn't already.
2. **The breakdown.** Gemini watches the file and writes down the transcript,
   the parts (hook, problem, the twist of the knife, solution, proof, the
   ask) and the scene cuts. This is Video's breakdown, unchanged.
3. **The four pieces.** Four writing calls run side by side, so the wait is
   the slowest one:
   - **Why it works:** the hook, each part in order, and what made it spread.
   - **The script:** the same parts in the same order, written for the
     topic, each about as long in seconds as the original's.
   - **More ideas:** 3 to 5 ideas in the same style, each with a hook line.
   - **Title and hashtags:** a title, a caption and hashtags.

A video already broken down skips to step 3 and answers at once. Any other
video goes to the background worker. The topic is kept on the saved video
(`pending_analysis`), and the worker writes the analysis when the breakdown
lands, so closing the page loses nothing.

## Rules it keeps

- **A script missing a part is refused.** The script must have every part
  the original had, or it isn't the same shape. The refusal names the
  missing part and asks to press Analyse again.
- **Each topic is its own analysis.** Analysing again with a different topic
  adds a new analysis and keeps the old one (`viral_analyses`).
- **Notes.** Each analysis has a Notes box that saves as you type.
- **No topic, no analysis.** An empty topic is refused, because the script
  needs one.

## The model and the cost

- **The model.** Every call is Gemini 3.8 Flash, with the shell's Gemini key
  from Settings → AI. Video lets a person pick GPT or Claude for writing.
  Viral asks Gemini alone, because the breakdown already needs a Gemini key
  (`src/server/viral/writer.ts`).
- **The meter.** Each call goes on the shell's AI meter under its own name,
  so the AI usage page shows each piece's cost apart:
  - `viral_breakdown`
  - `viral_why_it_works`
  - `viral_script`
  - `viral_ideas`
  - `viral_title`
- **The spend limit.** Every call carries the project's id, so the
  project's spend limit counts it.
- **The price shown first.** The Analyse box shows a rough price before it
  runs (`analysisPrice`). Flash costs $0.75 per million tokens in and $3.75
  per million out. A 30-second short that still needs its breakdown comes
  to about 4 cents: about 1.5 cents for Gemini to watch it, and about 2
  cents for the four writing calls. One already broken down is about 3
  cents, rounded up.
- **Unproven.** No real analysis has been run yet.
