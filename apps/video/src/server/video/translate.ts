import { z } from "zod"

import {
  TRANSLATE_LINE_MAX,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { askWriter } from "@/server/video/writer"

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
  const answer = await askWriter({
    userId,
    feature: TRANSLATE_FEATURE,
    metadata: { language, lines: lines.length },
    prompt: translatePrompt(language, lines),
    schema: translationSchema(lines.length),
    label: TRANSLATE_LABEL,
    timeoutMs: 120_000,
  })
  return tidy(answer.lines)
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
