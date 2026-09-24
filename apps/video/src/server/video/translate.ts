import { z } from "zod"

import { pickWriter } from "@/lib/video/ai-choices"
import {
  TRANSLATE_LINE_MAX,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { generateJson, requireGeminiKey } from "@/server/video/gemini"
import { askOpenAiJson } from "@/server/video/openai-json"
import { getAiDefaults } from "@/server/video/settings"
import { requireOpenAiKey } from "@/server/video/whisper"

/**
 * Translating caption lines.
 *
 * The lines go off as a list and must come back as a list of the
 * same length, one translation per line, so each one keeps the time of the
 * line it came from. Whichever AI is chosen for rewriting words does it, and
 * it goes on the meter as "translation" so its spend reads on its own line of
 * the AI dashboard.
 */

const TRANSLATE_LABEL = "Translation"
const TRANSLATE_FEATURE = "translation"

/** A list of exactly as many lines as were sent. Anything else is re-asked. */
function translationSchema(count: number) {
  return z.object({
    lines: z.array(z.string().max(TRANSLATE_LINE_MAX)).length(count),
  })
}

function translatePrompt(language: TranslateLanguage, lines: string[]) {
  return `Translate the subtitles of a short social video into ${language}.

The subtitles, in order, as a JSON list:
${JSON.stringify(lines)}

Answer with JSON only, in exactly this shape, and nothing else:
{ "lines": ["...", "..."] }

Rules:
- Give exactly ${lines.length} lines, one for each subtitle, in the same order. Never merge or split lines.
- Each line is shown on screen at the same moment as the original, so keep each one about as short as the original.
- The lines are one run of speech cut into pieces. Translate the meaning of the whole, then share it out so each line carries its own part.
- Keep names, brands and numbers as they are.
- Write it the way a native speaker would say it out loud, not word for word.
- A line that is already in ${language} stays as it is.
- No quotation marks around the lines, no notes, no hashtags, no emoji.`
}

export async function translateLines({
  userId,
  language,
  lines,
}: {
  userId: string
  language: TranslateLanguage
  lines: string[]
}): Promise<string[]> {
  const writer = pickWriter(await getAiDefaults(), {
    words: !!(await getAiKey("gemini")),
    openai: !!(await getAiKey("openai")),
  })
  const schema = translationSchema(lines.length)
  const prompt = translatePrompt(language, lines)
  const metadata = { language, lines: lines.length }

  if (writer?.id === "openai") {
    const apiKey = await requireOpenAiKey()
    return runAiCall(
      {
        userId,
        provider: "openai",
        model: writer.model,
        feature: TRANSLATE_FEATURE,
        metadata,
      },
      async () => {
        const answer = await askOpenAiJson({
          apiKey,
          model: writer.model,
          prompt,
          schema,
          label: TRANSLATE_LABEL,
          timeoutMs: 120_000,
        })
        return {
          result: tidy(answer.value.lines),
          usage: {
            inputTokens: answer.inputTokens,
            outputTokens: answer.outputTokens,
          },
        }
      }
    )
  }

  // No writer at all means no key for either, and Gemini is the one to ask
  // for: it is the one every words tool can use.
  const apiKey = await requireGeminiKey()
  const model = "gemini-2.5-flash"
  return runAiCall(
    {
      userId,
      provider: "gemini",
      model,
      feature: TRANSLATE_FEATURE,
      metadata,
    },
    async () => {
      const answer = await generateJson({
        apiKey,
        model,
        parts: [{ text: prompt }],
        schema,
        label: TRANSLATE_LABEL,
      })
      return {
        result: tidy(answer.value.lines),
        usage: {
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
        },
      }
    }
  )
}

/** Stray quotation marks off, and space tidied, line by line. */
function tidy(lines: string[]) {
  return lines.map((line) =>
    line
      .trim()
      .replace(/^["“]|["”]$/g, "")
      .replace(/\s+/g, " ")
  )
}
