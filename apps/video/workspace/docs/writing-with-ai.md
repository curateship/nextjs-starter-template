# Writing with AI

Four tools in the studio write or read words, and all four use one saved
choice of which AI does the writing. The choice is Gemini Flash, GPT-5 mini or Claude
Opus 5. Each one needs its own provider's key in Settings → AI.

## Which tools use the choice

| Tool | Where it is | Row on `/admin/ai` |
| --- | --- | --- |
| Rewrite the opening line | Video editor → AI → Hook | Hook variants (`hook_variants`) |
| Translate captions | Video editor → AI → Translate | Translation (`translation`) |
| Polish selected text | Carousel studio, the sparkle button | Carousel text help (`carousel_text_help`) |
| Check a script | Video editor → AI → Voice → Check it | Script check (`script_check`) |

- **Where the choice is made:** the "Who rewrites it" dropdown in the Hook and
  Translate windows. It is saved the moment it is picked, in
  `video_settings.ai_defaults.writer`, and every tool above uses it from then on.
- **The carousel and the script check have no dropdown:** they use whatever
  was last picked in Hook or Translate. Before Claude was added the carousel
  always used Gemini. The Voice window names the writer in its price line.
- **The one place that asks:** `askWriter` in `src/server/video/writer.ts`. The
  four tools hand it their question and get back the answer, whoever wrote it.
- **The list itself:** `WRITERS` in `src/lib/video/ai-choices.ts`. A new writer
  is one entry there, plus a caller if its provider is new.

## The three writers

| Writer | Model | Needs |
| --- | --- | --- |
| Gemini Flash | `gemini-3.8-flash` | a Google Gemini key |
| GPT-5 mini | `gpt-5-mini` | an OpenAI key |
| Claude Opus 5 | `claude-opus-5` | an Anthropic key |

The dropdown shows each writer's name and nothing else. A writer whose key is
missing is the one exception: it stays greyed out with a line saying which key
to add.

- **Claude is Opus 5** because that is the Anthropic default in
  `src/lib/ai/ai-models.ts`. Haiku 4.5 would be about a fifth of the price.
- **Claude is asked to think only a little** (`effort: "low"`), because
  rewording one line does not need more. It is still billed for that thinking
  as output.
- **A refused request gets a second try on another Claude model.** The call
  sends `fallbacks: "default"`, so if Claude's safety check turns the words
  down, Anthropic runs the same request on a model it picks. The meter still
  records it at Opus 5 prices.
- **No SDK:** Claude is called with plain `fetch` in
  `src/server/video/anthropic-json.ts`, the same way the OpenAI and Gemini
  callers work, so the app carries no extra package.

## When a key is missing

- **No key for a writer:** the dropdown still lists it, greyed out, with "Needs
  an Anthropic key. Add one in Settings → AI." (or the OpenAI or Gemini
  version). It cannot be picked until the key is saved.
- **The key is removed after the writer was picked:** nothing breaks. The next
  press uses the first writer that still has a key, in the order Gemini, GPT,
  Claude. The saved choice is kept, so saving the key again switches back.
- **What the window says then:** under the dropdown, "Claude Opus 5 was chosen,
  but no Anthropic key is saved any more, so Gemini Flash is doing it. Add the
  key in Settings → AI to switch back." The dropdown shows Gemini Flash.
- **No writer has a key at all:** the dropdown is not drawn. Pressing the tool
  says "No Google Gemini key is saved — add one in Settings → AI".
- **Checked every press:** keys are read fresh each time, so removing one takes
  effect on the next press, not the next deploy.

## What it costs

Every call goes on the shell's AI meter under the tool's row above, with the
provider and model beside it. The prices come from `src/lib/ai/ai-models.ts`.

- **A hook rewrite with Claude:** about 250 tokens in and 80 tokens
  out, which is 250 × $5 + 80 × $25 per million, or about $0.003, plus thinking.
- **The same with Gemini Flash:** 250 × $0.75 + 80 × $3.75 per million, or
  about $0.0005, six times less.
- **Gemini Flash is `gemini-3.8-flash` since 17 Oct 2026.** Google stopped
  serving `gemini-2.5-flash` to this key: every call answered "This model
  models/gemini-2.5-flash is no longer available to new users" (HTTP 404),
  which is what broke Save & break down, captions, Tighten and the Gemini
  writer. Usage rows from before that date still say 2.5 and are priced at its
  old rate.
- **A refused request** costs nothing and is recorded as a failed row.
- **Before the press:** the Hook and Another language buttons say what the
  chosen writer will cost, and change when another is picked
  ([price-before-you-press.md](price-before-you-press.md)).
