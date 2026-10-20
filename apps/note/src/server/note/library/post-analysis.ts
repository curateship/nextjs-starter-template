import { z } from "zod"

import { DEFAULT_AI_MODEL } from "@/lib/ai/ai-models"
import { runAiCall } from "@/server/ai/usage"
import { generateJson } from "@/server/note/gemini"
import type { NoteRow } from "@/server/note/schema"
import { formatDate } from "@/lib/format/format-time"
import type { PlanStep, Quote } from "@/lib/note/library/notes"

/**
 * What Gemini is asked about an imported X post, in one call: the post's
 * words, the post it quotes, the rest of its thread, what was said in its
 * video, and its pictures, so the words inside a screenshot or a chart count
 * too. It writes the summary, the action plan, the best lines and the tags.
 *
 * A second call, for "One plan from many", reads several notes' plans and
 * writes one list with repeats dropped.
 *
 * Each call is one row on the shell's AI meter, so the monthly allowance holds
 * and the AI usage screen shows them.
 */

const MODEL = DEFAULT_AI_MODEL.gemini
/** The most a list may hold before the answer is not believed at all. */
const SANE_LIST = 60

const postAnswerSchema = z.object({
  summary: z.array(z.string().max(600)).max(SANE_LIST).transform((list) => list.slice(0, 8)),
  actionPlan: z.array(z.string().max(400)).max(SANE_LIST).transform((list) => list.slice(0, 12)),
  quotes: z.array(z.string().max(600)).max(SANE_LIST).catch([]),
  tags: z.array(z.string().max(60)).max(SANE_LIST),
})

const mergeAnswerSchema = z.object({
  plan: z
    .array(z.object({ text: z.string().max(400), note: z.number().int().nullable().catch(null) }))
    .max(SANE_LIST)
    .transform((list) => list.slice(0, 30)),
})

export type PostPicturePart = { mimeType: string; data: Uint8Array }

export type PostAnswer = {
  summary: string[]
  actionPlan: PlanStep[]
  quotes: Quote[]
  tags: string[]
}

function atHandle(handle: string | null | undefined) {
  return handle ? `@${handle}` : "someone"
}

function postPrompt(row: NoteRow, aboutYou: string, pictureCount: number) {
  const blocks: string[] = []
  blocks.push(
    `POST by ${row.authorName ?? ""} (${atHandle(row.authorHandle)})${row.postedAt ? `, ${formatDate(row.postedAt)}` : ""}:\n${row.postText ?? ""}`
  )
  if (row.quoted) {
    blocks.push(`IT QUOTES a post by ${atHandle(row.quoted.authorHandle)}:\n${row.quoted.text}`)
  }
  if (row.thread?.length) {
    blocks.push(
      `THE REST OF THE THREAD, in order:\n${row.thread.map((post, index) => `${index + 2}. ${post.text}`).join("\n\n")}`
    )
  }
  if (row.transcript?.length) {
    blocks.push(`WHAT IS SAID IN ITS VIDEO:\n${row.transcript.map((line) => line.text).join(" ")}`)
  }
  if (pictureCount) {
    blocks.push(
      `The ${pictureCount === 1 ? "picture" : `${pictureCount} pictures`} attached above belong to this post. Read any words in them.`
    )
  }
  const forWhom = aboutYou.trim()
    ? `Write the plan for someone who: ${aboutYou.trim()}`
    : "Write the plan for a person who saved this post to act on it."

  return `Below is a post from X that a person saved, with everything that goes with it.

Write everything in English, whatever language the post is in.
${forWhom}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "summary": ["..."], "actionPlan": ["..."], "quotes": ["..."], "tags": ["..."] }

Rules:
- "summary": 3 to 8 bullets. Each is one plain sentence saying one thing the post says.
- "actionPlan": 3 to 12 steps. Each is one thing this person could do this week because of this post, and starts with a verb.
- "quotes": up to 6 of the best lines, word for word from the post, its thread or its video (in English if they were written in another language).
- "tags": up to 8 topics, lowercase, one or two words each.

${blocks.join("\n\n")}`
}

/** One post, everything it holds, read and planned from in one call. */
export async function summarisePost(options: {
  row: NoteRow
  apiKey: string
  aboutYou: string
  pictures: PostPicturePart[]
}): Promise<PostAnswer> {
  const { row, apiKey, aboutYou, pictures } = options
  const label = "Analysing"
  const answer = await runAiCall(
    {
      userId: row.ownerId,
      provider: "gemini",
      model: MODEL,
      feature: "note_post_summarise",
      metadata: { noteId: row.id },
    },
    async () => {
      const result = await generateJson({
        apiKey,
        model: MODEL,
        parts: [
          ...pictures.map((picture) => ({
            inline_data: { mime_type: picture.mimeType, data: Buffer.from(picture.data).toString("base64") },
          })),
          { text: postPrompt(row, aboutYou, pictures.length) },
        ],
        schema: postAnswerSchema,
        label,
      })
      return {
        result: result.value,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      }
    }
  )
  return tidyPostAnswer(answer)
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim()

/** The answer as it is saved: blank entries gone, tags lowercased and said once, steps unticked. */
export function tidyPostAnswer(answer: z.infer<typeof postAnswerSchema>): PostAnswer {
  return {
    summary: answer.summary.map(clean).filter(Boolean),
    actionPlan: answer.actionPlan
      .map(clean)
      .filter(Boolean)
      .map((text) => ({ text, done: false })),
    quotes: answer.quotes
      .map(clean)
      .filter(Boolean)
      .slice(0, 6)
      .map((text) => ({ text, startMs: null })),
    tags: [...new Set(answer.tags.map((tag) => clean(tag).toLowerCase()).filter(Boolean))].slice(0, 8),
  }
}

/** Checks a post answer the way the worker does, for the tests. */
export function readPostAnswer(value: unknown) {
  return postAnswerSchema.safeParse(value)
}

/**
 * One plan from several notes' plans, with the steps that say the same thing
 * said once, each naming the note it came from.
 */
export async function mergePlans(options: {
  ownerId: string
  mergedId: string
  apiKey: string
  aboutYou: string
  notes: { title: string; summary: string[]; plan: PlanStep[] }[]
}): Promise<PlanStep[]> {
  const { ownerId, mergedId, apiKey, aboutYou, notes } = options
  const label = "Writing the plan"
  const listed = notes
    .map(
      (note, index) =>
        `NOTE ${index + 1} (${note.title})\nWhat it says: ${note.summary.join(" ")}\nIts plan:\n${note.plan.map((step) => `- ${step.text}`).join("\n")}`
    )
    .join("\n\n")
  const prompt = `Below are several videos and posts a person saved, each with an action plan.

Write everything in English.
${aboutYou.trim() ? `Write the plan for someone who: ${aboutYou.trim()}` : ""}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "plan": [{ "text": "...", "note": 1 }] }

Rules:
- Merge the plans into ONE ordered plan of 3 to 20 steps, in the order a person should do them.
- Steps that say the same thing appear once.
- Each step is one thing to do, starts with a verb, and "note" is the number of the note it mostly came from.

${listed}`

  const answer = await runAiCall(
    {
      userId: ownerId,
      provider: "gemini",
      model: MODEL,
      feature: "note_plan_merge",
      metadata: { noteId: mergedId },
    },
    async () => {
      const result = await generateJson({
        apiKey,
        model: MODEL,
        parts: [{ text: prompt }],
        schema: mergeAnswerSchema,
        label,
      })
      return {
        result: result.value,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      }
    }
  )
  return tidyMergeAnswer(answer, notes)
}

export function tidyMergeAnswer(answer: z.infer<typeof mergeAnswerSchema>, notes: { title: string }[]): PlanStep[] {
  const seen = new Set<string>()
  return answer.plan.flatMap((step) => {
    const text = clean(step.text)
    if (!text || seen.has(text.toLowerCase())) return []
    seen.add(text.toLowerCase())
    const from = step.note !== null ? notes[step.note - 1]?.title : undefined
    return [from ? { text, done: false, from } : { text, done: false }]
  })
}

/** Checks a merge answer the way the worker does, for the tests. */
export function readMergeAnswer(value: unknown) {
  return mergeAnswerSchema.safeParse(value)
}
