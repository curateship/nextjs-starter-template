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
     The same call names the hook's type for the Library, from the fixed
     types and your own, at no extra cost (`library.md`, "Hook types").
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

## Who writes

Tyler, 6 Nov 2026: "Once in Settings", used by every project, the way Video
picks its writer. The choice is on Settings → AI writer
(`src/components/viral/settings/writer-settings.tsx`) and saves the moment it
is picked. There is no Save button.

- **The three writers.** Copied from Video (`WRITERS` in
  `src/lib/viral/writers.ts`):

  | Writer | Model | Needs |
  | --- | --- | --- |
  | Gemini Flash | `gemini-3.8-flash` | a Google Gemini key |
  | GPT-5 mini | `gpt-5-mini` | an OpenAI key |
  | Claude Opus 5 | `claude-opus-5` | an Anthropic key |

- **The default.** Gemini Flash, until another is picked.
- **One choice for the app.** It lives on Viral's one settings row
  (`viral_settings.writer`, `drizzle/0107_viral_writer_country_year.sql`), the
  same as the keys it needs in Settings → AI, which are the app's too.
- **Gemini still watches.** The breakdown is always Gemini Flash, whoever
  writes, so a Gemini key is still needed to analyse a video.
- **What follows the choice.** Every call that writes words: the four
  pieces, Same idea's search line, keyword ideas, scripts from a format,
  Write a post for Promo, a saved post's four pieces, Write a script on
  your own idea, Write hooks like this, the hook-type labelling pass, and
  Write an ad like this.
- **The topic match doesn't.** It always asks Gemini Flash. It runs on its
  own after every search and every daily re-check, with no price shown first,
  and it gives each title a number rather than writing words. A pricier
  writer would only cost more for the same scores.
- **The one place that asks.** `askWriter` in `src/server/viral/writer.ts`.
  A feature hands it the meter name, the metadata, a prompt that asks for
  JSON, the answer's shape and a label, and gets the answer back whoever
  wrote it. GPT refuses a prompt that never says "JSON".
- **Claude.** It is called with plain `fetch` and asked to think only a
  little, as in Video (`src/server/viral/anthropic-json.ts`). A refused
  request gets one more try on another Claude model Anthropic picks.

## When a key is missing

- **In the list.** A writer whose key isn't saved is greyed out with "Needs an
  Anthropic key. Add one in Settings → AI." (or the OpenAI or Gemini version).
  The server refuses to save it too.
- **A key removed after the pick.** Nothing breaks. The next press uses the
  first writer that still has a key, in the order Gemini, GPT, Claude. The
  pick is kept, so saving the key again switches back. The tab says so:
  "Claude Opus 5 was chosen, but no Anthropic key is saved any more, so
  Gemini Flash is writing."
- **No key at all.** Pressing a button says "No Google Gemini key is saved -
  add one in Settings → AI".
- **The messages.** Each provider's sentence is in
  `src/lib/viral/ai-providers.ts`, so the screen shows it as written.

## When GPT or Claude turns a call away

`writerRefusalMessage` in `src/lib/viral/ai-providers.ts` reads the reason in
the reply and says it in words. The reply itself never reaches the screen.

- **No credit left.** OpenAI answers 429 and Anthropic 400 when the account has
  no money on it. The screen says "Your OpenAI account has no credit left. Add
  some at platform.openai.com → Billing, or pick another writer in Settings →
  AI writer." Waiting does not help, so it never says to wait.
- **Busy.** A 429, 503 or 529 for any other reason says "OpenAI is turning
  requests away right now. Wait a minute and try again." (or Anthropic).
- **Anything else.** The piece and the number, such as "The script failed (HTTP
  401)".
- **No answer.** Every call that writes words stops after 60 seconds with "The
  script took too long" (or that piece's name), whichever writer is asked
  (`WRITER_TIMEOUT_MS` in `src/server/viral/writer.ts`). Google can hold a busy
  request for minutes, and without the limit the button spun for about 3
  minutes on 6 Nov 2026. Watching a video has no such limit, because a long
  video can need longer.

## The cost

- **The meter.** Each call goes on the shell's AI meter under its own name,
  with the writer's provider and model beside it. With Claude picked, the AI
  usage page shows the pieces under Claude. The names are the same whoever
  writes:
  - `viral_breakdown`
  - `viral_why_it_works`
  - `viral_script`
  - `viral_ideas`
  - `viral_title`
  - `viral_post_analysis`, all four calls of a post saved to the vault, so a
    post's cost reads apart from a video's
  - `viral_own_idea_script`, Write a script on your own idea
  - `viral_hook_ideas`, Write hooks like this on the Library
  - `viral_hook_type`, the Label button on Settings → Hook types
  - `viral_ad_copy`, Write an ad like this on a Winning ad
- **The spend limit.** Every call carries the project's id, so the
  project's spend limit counts it. The one call that doesn't is the hook-type
  labelling pass: a hook can be analysed in several projects, so its cost
  belongs to none of them and no project's limit counts it.
- **Every price names the writer.** Each price shown before the AI runs ends
  "with Gemini Flash" or the picked writer's name, and uses that writer's
  price (`writerDollars` and `roundedCents` in `src/lib/viral/writers.ts`).
  If the picked writer's key is gone, the price names the writer that will
  really run.
- **The Analyse box** (`analysisPrice`). Each of the four writing calls
  reads about 3,000 tokens and writes about 800, at the writer's price. The
  breakdown is priced at Gemini Flash's $0.75 a million tokens in and $3.75
  out, whoever writes. For a 30-second short:

  | Writer | Already broken down | Still to be watched |
  | --- | ---: | ---: |
  | Gemini Flash | 3 cents | 4 cents |
  | GPT-5 mini | 1 cent | 3 cents |
  | Claude Opus 5 | 14 cents | 16 cents |

  Claude's 14 cents is four calls of 3,000 × $5 + 800 × $25 per million.
- **A script from a format:** 1 cent with Gemini Flash or GPT-5 mini, 3 cents
  with Claude Opus 5.
- **A post for Promo:** 1 cent with Gemini Flash or GPT-5 mini, 3 cents with
  Claude Opus 5.
- **A post saved to the vault** (`postAnalysisPrice` in
  `src/server/viral/vault-ai.ts`). Four calls, each reading about 1,500 tokens
  and writing about 800: 2 cents with Gemini Flash, 1 cent with GPT-5 mini,
  11 cents with Claude Opus 5. Claude's is four calls of 1,500 × $5 + 800 ×
  $25 per million, $0.11.
- **Write a script on your own idea** (`ownIdeaScriptPrice`). One call of
  about 1,000 tokens in and 600 out: 1 cent with Gemini Flash or GPT-5 mini,
  2 cents with Claude Opus 5.
- **Write hooks like this** (`hookIdeasPrice` in
  `src/server/viral/hook-ideas.ts`). One call of about 600 tokens in and 250
  out: 1 cent with any of the three writers.
- **Labelling old hooks** (`labelPrice` in `src/server/viral/hook-types.ts`).
  25 hooks to a call, each call about 1,500 tokens in and 400 out. A full
  press of 200 hooks is 8 calls: 3 cents with Gemini Flash, 1 cent with
  GPT-5 mini, 14 cents with Claude Opus 5. That is under a tenth of a cent a
  hook with any writer.
- **Write an ad like this** (`adCopyPrice` in `src/server/viral/ad-copy.ts`).
  One call of about 900 tokens in and 300 out: 1 cent with Gemini Flash or
  GPT-5 mini, 2 cents with Claude Opus 5.
- **Unproven.** No real analysis has been run yet, and no real GPT or Claude
  call has written for Viral. The server tests stub all three providers.
