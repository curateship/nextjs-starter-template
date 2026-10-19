import { z } from "zod"

import { DEFAULT_AI_MODEL } from "@/lib/ai/ai-models"
import { runAiCall } from "@/server/ai/usage"
import { generateJson, withGeminiFile } from "@/server/note/gemini"
import type { ActionStep, Quote, TranscriptLine } from "@/lib/note/videos"

/**
 * What Gemini is asked about a saved video, in two calls.
 *
 * The first listens to the sound only, never the picture, and writes every
 * word down with the time it was said, in the language spoken. The second
 * reads that transcript as text and writes the summary, the action plan, the
 * quotes and the tags, in English whatever was spoken. Each call is one row on
 * the shell's AI meter, so the monthly allowance holds and the AI usage screen
 * shows both.
 */

const MODEL = DEFAULT_AI_MODEL.gemini

/** The most a list may hold before the answer is not believed at all. */
const SANE_LIST = 60

const transcriptSchema = z.object({
  language: z.string().trim().min(1).max(20).catch("und"),
  lines: z
    .array(
      z.object({
        startMs: z.number().finite(),
        endMs: z.number().finite(),
        text: z.string().max(2000),
      })
    )
    .max(3000),
})

/**
 * The answer's bounds. Each list is capped where the question caps it rather
 * than failing over one bullet too many, because by now the transcript has
 * been paid for. A quote with a time that is not a number is dropped, not
 * failed.
 */
const summarySchema = z.object({
  summary: z.array(z.string().max(600)).max(SANE_LIST).transform((list) => list.slice(0, 8)),
  actionPlan: z
    .array(z.string().max(400))
    .max(SANE_LIST)
    .transform((list) => list.slice(0, 12)),
  quotes: z
    .array(
      z.object({
        text: z.string().max(600),
        startMs: z.number().finite().nullable().catch(null),
      })
    )
    .max(SANE_LIST),
  tags: z.array(z.string().max(60)).max(SANE_LIST),
})

export type Transcript = { language: string; lines: TranscriptLine[] }

export type Summary = {
  summary: string[]
  actionPlan: ActionStep[]
  quotes: Quote[]
  tags: string[]
}

function transcribePrompt(durationMs: number | null) {
  const durationLine = durationMs
    ? `The sound is ${durationMs} ms long; every startMs and endMs must lie between 0 and ${durationMs}.`
    : "Times are whole milliseconds from the start of the sound."
  return `You are writing down every word spoken in this recording.
${durationLine}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "language": "en", "lines": [{ "startMs": 0, "endMs": 2400, "text": "..." }] }

Rules:
- "language": the language mostly spoken, as a two-letter code such as "en", "es" or "vi".
- "lines": everything said, in order, written in the language it is spoken in. Never translate.
- Each line is ONE spoken sentence or phrase. startMs is when it starts being said, endMs when it ends.
- NEVER repeat a line. Each thing said appears once, at the time it is said.
- Leave out music, sound effects and silence. If nobody speaks, return "lines": [].`
}

function summarisePrompt(lines: TranscriptLine[]) {
  const transcript = lines.map((line) => `[${line.startMs}] ${line.text}`).join("\n")
  return `Below is the transcript of a video, one spoken line per row. Each row starts with the millisecond it is said at.

Write everything in English, whatever language the transcript is in.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "summary": ["..."], "actionPlan": ["..."], "quotes": [{ "text": "...", "startMs": 0 }], "tags": ["..."] }

Rules:
- "summary": 3 to 8 bullets. Each is one plain sentence saying one thing the video says.
- "actionPlan": 3 to 12 steps. Each is one thing a person could do this week because of this video, and starts with a verb.
- "quotes": up to 6 of the best lines actually said, word for word (in English if they were said in another language). Each has the startMs of the transcript row it came from.
- "tags": up to 8 topics, lowercase, one or two words each.

Transcript:
${transcript}`
}

/**
 * Writes down every word in the sound, with times, in the language spoken.
 * `sound` is the small mp3 the worker cut out of the file. `about` names the
 * saved video, or the saved post whose video it is, on the AI meter's row.
 */
export async function transcribe(options: {
  ownerId: string
  about: { noteVideoId: string } | { notePostId: string }
  apiKey: string
  sound: Uint8Array
  durationMs: number | null
}): Promise<Transcript> {
  const { ownerId, about, apiKey, sound, durationMs } = options
  const label = "Writing the words down"
  const answer = await runAiCall(
    {
      userId: ownerId,
      provider: "gemini",
      model: MODEL,
      feature: "note_transcribe",
      metadata: about,
    },
    async () => {
      const result = await withGeminiFile(sound, "audio/mpeg", apiKey, label, (part) =>
        generateJson({
          apiKey,
          model: MODEL,
          parts: [part, { text: transcribePrompt(durationMs) }],
          schema: transcriptSchema,
          label,
        })
      )
      return {
        result: result.value,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      }
    }
  )
  return {
    language: answer.language.toLowerCase(),
    lines: tidyTranscript(answer.lines, durationMs),
  }
}

/**
 * Reads the transcript and writes the summary, plan, quotes and tags, in
 * English. Text only, so it costs a fraction of the listening.
 */
export async function summarise(options: {
  ownerId: string
  videoId: string
  apiKey: string
  lines: TranscriptLine[]
  durationMs: number | null
}): Promise<Summary> {
  const { ownerId, videoId, apiKey, lines, durationMs } = options
  const label = "Summarising"
  const answer = await runAiCall(
    {
      userId: ownerId,
      provider: "gemini",
      model: MODEL,
      feature: "note_summarise",
      metadata: { noteVideoId: videoId },
    },
    async () => {
      const result = await generateJson({
        apiKey,
        model: MODEL,
        parts: [{ text: summarisePrompt(lines) }],
        schema: summarySchema,
        label,
      })
      return {
        result: result.value,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      }
    }
  )
  return tidySummary(answer, lines, durationMs)
}

/**
 * Rounds and clamps every time into the sound, puts the lines in order, and
 * drops empty lines and a line said twice in a row. The screen jumps the
 * player to these numbers, so a time past the end would seek past the end. A
 * line with no length is given the time up to the next one, so it can still
 * light up while it plays.
 */
export function tidyTranscript(
  lines: readonly TranscriptLine[],
  durationMs: number | null
): TranscriptLine[] {
  const sorted = lines
    .map((line) => ({
      startMs: clamp(line.startMs, durationMs),
      endMs: clamp(line.endMs, durationMs),
      text: line.text.replace(/\s+/g, " ").trim(),
    }))
    .filter((line) => line.text)
    .sort((left, right) => left.startMs - right.startMs)

  const tidied: TranscriptLine[] = []
  sorted.forEach((line, index) => {
    if (tidied.at(-1)?.text === line.text) return
    const next = sorted[index + 1]?.startMs
    const endMs =
      line.endMs > line.startMs
        ? line.endMs
        : Math.max(line.startMs + 1, next ?? durationMs ?? line.startMs + 1000)
    tidied.push({ ...line, endMs })
  })
  return tidied
}

/**
 * The summary as it is saved: blank entries gone, tags lowercased and said
 * once, steps unticked, and a quote kept only when its time is inside the
 * video.
 */
export function tidySummary(
  answer: z.infer<typeof summarySchema>,
  lines: readonly TranscriptLine[],
  durationMs: number | null
): Summary {
  const end = durationMs ?? lines.at(-1)?.endMs ?? null
  const clean = (text: string) => text.replace(/\s+/g, " ").trim()
  return {
    summary: answer.summary.map(clean).filter(Boolean),
    actionPlan: answer.actionPlan
      .map(clean)
      .filter(Boolean)
      .map((text) => ({ text, done: false })),
    quotes: answer.quotes
      .flatMap((quote) =>
        quote.startMs !== null &&
        quote.startMs >= 0 &&
        (end === null || quote.startMs <= end) &&
        clean(quote.text)
          ? [{ text: clean(quote.text), startMs: Math.round(quote.startMs) }]
          : []
      )
      .slice(0, 6),
    tags: [...new Set(answer.tags.map((tag) => clean(tag).toLowerCase()).filter(Boolean))].slice(
      0,
      8
    ),
  }
}

/** Checks a summary answer the way the worker does, for the tests. */
export function readSummaryAnswer(value: unknown) {
  return summarySchema.safeParse(value)
}

function clamp(value: number, durationMs: number | null): number {
  const rounded = Math.max(0, Math.round(value))
  return durationMs ? Math.min(rounded, durationMs) : rounded
}
