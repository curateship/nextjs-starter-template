# Writing with AI

Three tools in the studio write words, and all three use one saved choice of
which AI does the writing. The choice is Gemini Flash, GPT-5 mini or Claude
Opus 5. Each one needs its own provider's key in Settings → AI.

## Which tools use the choice

| Tool | Where it is | Row on `/admin/ai` |
| --- | --- | --- |
| Rewrite the opening line | Video editor → AI → Hook | Hook variants (`hook_variants`) |
| Translate captions | Video editor → AI → Translate | Translation (`translation`) |
| Polish selected text | Carousel studio, the sparkle button | Carousel text help (`carousel_text_help`) |

- **Where the choice is made:** the "Who rewrites it" dropdown in the Hook and
  Translate windows. It is saved the moment it is picked, in
  `video_settings.ai_defaults.writer`, and every tool above uses it from then on.
- **The carousel has no dropdown:** it uses whatever was last picked in Hook or
  Translate. Before Claude was added it always used Gemini.
- **The one place that asks:** `askWriter` in `src/server/video/writer.ts`. The
  three tools hand it their question and get back the answer, whoever wrote it.
- **The list itself:** `WRITERS` in `src/lib/video/ai-choices.ts`. A new writer
  is one entry there, plus a caller if its provider is new.

## The three writers

| Writer | Model | Needs | Note shown in the dropdown |
| --- | --- | --- | --- |
| Gemini Flash | `gemini-2.5-flash` | a Google Gemini key | Quick and cheap. |
| GPT-5 mini | `gpt-5-mini` | an OpenAI key | A second opinion, in a different voice. |
| Claude Opus 5 | `claude-opus-5` | an Anthropic key | Reads most like a person wrote it. The dearest of the three. |

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
- **The same with Gemini Flash:** about $0.0003, ten times less.
- **A refused request** costs nothing and is recorded as a failed row.
