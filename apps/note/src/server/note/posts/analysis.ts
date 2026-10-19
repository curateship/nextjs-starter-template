import { z } from "zod"

import { DEFAULT_AI_MODEL } from "@/lib/ai/ai-models"
import { runAiCall } from "@/server/ai/usage"
import { generateJson } from "@/server/note/gemini"
import type { NotePostRow } from "@/server/note/schema"
import { formatDate } from "@/lib/format/format-time"
import { atHandle, type PlanStep } from "@/lib/note/posts/posts"

/**
 * What Gemini is asked about a saved post, in one call: the post's words, the
 * post it quotes, the rest of its thread, the article when it was brought in,
 * what was said in its video, and its pictures, so the words inside a
 * screenshot or a chart count too. It writes the summary, the action plan and
 * the tags, picks one of the person's folders, and says whether a post saved
 * earlier says nearly the same thing.
 *
 * A second call, for "One plan from many", reads several posts' plans and
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
  tags: z.array(z.string().max(60)).max(SANE_LIST),
  folder: z.string().max(200).nullable().catch(null),
  similar: z.string().max(20).nullable().catch(null),
})

const mergeAnswerSchema = z.object({
  plan: z
    .array(z.object({ text: z.string().max(400), post: z.number().int().nullable().catch(null) }))
    .max(SANE_LIST)
    .transform((list) => list.slice(0, 30)),
})

export type PostPicturePart = { mimeType: string; data: Uint8Array }

export type PostAnswer = {
  summary: string[]
  actionPlan: PlanStep[]
  tags: string[]
  folderId: string | null
  similarPostId: string | null
}

export type SimilarCandidate = {
  id: string
  title: string
  savedAt: Date
  firstSummaryLine: string | null
  tags: string[]
}

function postPrompt(options: {
  row: NotePostRow
  aboutYou: string
  folders: { id: string; name: string }[]
  others: SimilarCandidate[]
  pictureCount: number
}) {
  const { row, aboutYou, folders, others, pictureCount } = options
  const blocks: string[] = []
  blocks.push(
    `POST by ${row.authorName ?? ""} (${atHandle(row.authorHandle)})${row.postedAt ? `, ${formatDate(row.postedAt)}` : ""}:\n${row.text ?? ""}`
  )
  if (row.quoted) {
    blocks.push(`IT QUOTES a post by ${atHandle(row.quoted.authorHandle)}:\n${row.quoted.text}`)
  }
  if (row.thread?.length) {
    blocks.push(
      `THE REST OF THE THREAD, in order:\n${row.thread.map((post, index) => `${index + 2}. ${post.text}`).join("\n\n")}`
    )
  }
  if (row.articleText) {
    blocks.push(
      `THE ARTICLE IT LINKS TO${row.articleTitle ? ` ("${row.articleTitle}")` : ""}:\n${row.articleText}`
    )
  }
  if (row.transcript?.length) {
    blocks.push(`WHAT IS SAID IN ITS VIDEO:\n${row.transcript.map((line) => line.text).join(" ")}`)
  }
  if (pictureCount) {
    blocks.push(`The ${pictureCount === 1 ? "picture" : `${pictureCount} pictures`} attached above belong to this post. Read any words in them.`)
  }

  const folderList = folders.length
    ? folders.map((folder) => `- ${folder.name}`).join("\n")
    : "(no folders yet)"
  const otherList = others.length
    ? others
        .map(
          (other, index) =>
            `S${index + 1} | ${other.title} | ${other.firstSummaryLine ?? ""} | ${other.tags.join(", ")}`
        )
        .join("\n")
    : "(none)"
  const forWhom = aboutYou.trim()
    ? `Write the plan for someone who: ${aboutYou.trim()}`
    : "Write the plan for a person who saved this post to act on it."

  return `Below is a post from X that a person saved, with everything that goes with it.

Write everything in English, whatever language the post is in.
${forWhom}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "summary": ["..."], "actionPlan": ["..."], "tags": ["..."], "folder": "..." or null, "similar": "S3" or null }

Rules:
- "summary": 3 to 8 bullets. Each is one plain sentence saying one thing the post says.
- "actionPlan": 3 to 12 steps. Each is one thing this person could do this week because of this post, and starts with a verb.
- "tags": up to 8 topics, lowercase, one or two words each.
- "folder": the name, exactly as written, of the ONE folder below this post belongs in, or null if none fits.
- "similar": the label (such as "S3") of the ONE saved post below that says nearly the same thing as this one, or null. Only name one that really makes the same point.

Folders:
${folderList}

Posts saved earlier (label | who | what it says | tags):
${otherList}

${blocks.join("\n\n")}`
}

/** One post, everything it holds, read and planned from in one call. */
export async function summarisePost(options: {
  row: NotePostRow
  apiKey: string
  aboutYou: string
  folders: { id: string; name: string }[]
  others: SimilarCandidate[]
  pictures: PostPicturePart[]
}): Promise<PostAnswer> {
  const { row, apiKey, folders, others, pictures } = options
  const label = "Analysing"
  const answer = await runAiCall(
    {
      userId: row.ownerId,
      provider: "gemini",
      model: MODEL,
      feature: "note_post_summarise",
      metadata: { notePostId: row.id },
    },
    async () => {
      const result = await generateJson({
        apiKey,
        model: MODEL,
        parts: [
          ...pictures.map((picture) => ({
            inline_data: { mime_type: picture.mimeType, data: Buffer.from(picture.data).toString("base64") },
          })),
          { text: postPrompt({ ...options, pictureCount: pictures.length }) },
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
  return tidyPostAnswer(answer, folders, others)
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim()

/**
 * The answer as it is saved: blank entries gone, tags lowercased and said
 * once, steps unticked, and a folder or a similar post kept only when it is
 * one of this person's own. Anything else the AI named is dropped without a
 * word, since nobody asked for that one value.
 */
export function tidyPostAnswer(
  answer: z.infer<typeof postAnswerSchema>,
  folders: { id: string; name: string }[],
  others: { id: string }[]
): PostAnswer {
  const folderName = answer.folder ? clean(answer.folder).toLowerCase() : ""
  const similarIndex = answer.similar?.match(/^S(\d+)$/i)?.[1]
  const similar = similarIndex ? others[Number(similarIndex) - 1] : undefined
  return {
    summary: answer.summary.map(clean).filter(Boolean),
    actionPlan: answer.actionPlan
      .map(clean)
      .filter(Boolean)
      .map((text) => ({ text, done: false })),
    tags: [...new Set(answer.tags.map((tag) => clean(tag).toLowerCase()).filter(Boolean))].slice(0, 8),
    folderId: folders.find((folder) => folder.name.toLowerCase() === folderName)?.id ?? null,
    similarPostId: similar?.id ?? null,
  }
}

/** Checks a post answer the way the worker does, for the tests. */
export function readPostAnswer(value: unknown) {
  return postAnswerSchema.safeParse(value)
}

/**
 * One plan from several posts' plans, with the steps that say the same thing
 * said once, each naming the post it came from.
 */
export async function mergePostPlans(options: {
  ownerId: string
  mergedId: string
  apiKey: string
  aboutYou: string
  posts: { title: string; summary: string[]; plan: PlanStep[] }[]
}): Promise<PlanStep[]> {
  const { ownerId, mergedId, apiKey, aboutYou, posts } = options
  const label = "Writing the plan"
  const listed = posts
    .map(
      (post, index) =>
        `POST ${index + 1} (${post.title})\nWhat it says: ${post.summary.join(" ")}\nIts plan:\n${post.plan.map((step) => `- ${step.text}`).join("\n")}`
    )
    .join("\n\n")
  const prompt = `Below are several posts a person saved from X, each with an action plan.

Write everything in English.
${aboutYou.trim() ? `Write the plan for someone who: ${aboutYou.trim()}` : ""}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "plan": [{ "text": "...", "post": 1 }] }

Rules:
- Merge the plans into ONE ordered plan of 3 to 20 steps, in the order a person should do them.
- Steps that say the same thing appear once.
- Each step is one thing to do, starts with a verb, and "post" is the number of the post it mostly came from.

${listed}`

  const answer = await runAiCall(
    {
      userId: ownerId,
      provider: "gemini",
      model: MODEL,
      feature: "note_post_merge",
      metadata: { notePostId: mergedId },
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
  return tidyMergeAnswer(answer, posts)
}

export function tidyMergeAnswer(
  answer: z.infer<typeof mergeAnswerSchema>,
  posts: { title: string }[]
): PlanStep[] {
  const seen = new Set<string>()
  return answer.plan.flatMap((step) => {
    const text = clean(step.text)
    if (!text || seen.has(text.toLowerCase())) return []
    seen.add(text.toLowerCase())
    const from = step.post !== null ? posts[step.post - 1]?.title : undefined
    return [from ? { text, done: false, from } : { text, done: false }]
  })
}

/** Checks a merge answer the way the worker does, for the tests. */
export function readMergeAnswer(value: unknown) {
  return mergeAnswerSchema.safeParse(value)
}
