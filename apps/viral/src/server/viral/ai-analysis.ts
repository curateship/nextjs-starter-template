import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { AI_MODEL_PRICES } from "@/lib/ai/ai-models"
import {
  ANALYSIS_FEATURES,
  ANALYSIS_NOTES_MAX,
  ANALYSIS_TOPIC_MAX,
  missingScriptParts,
  type AnalysisPieces,
  type ViralAnalysis,
} from "@/lib/viral/analysis"
import { SEGMENT_ROLES, segmentRoleLabels, type SegmentRole, type ViralBreakdown } from "@/lib/viral/viral-breakdown"
import { viralSays } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { readStoredBreakdown } from "@/server/viral/analysis"
import { requireViralProjectBudget, viralProjectSpendMetadata } from "@/server/viral/project-spend"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { saveVideo, type SavedVideoDetail } from "@/server/viral/saved-videos"
import { viralAnalyses, viralVideos, type ViralProjectRow, type ViralVideoRow } from "@/server/viral/schema"
import { askWriter, WRITER_MODEL } from "@/server/viral/writer"

/**
 * Analyse with AI (`workspace/docs/ai-analysis.md`, task part 15). The video
 * is downloaded and Gemini watches it, exactly as Video's breakdown does.
 * Then four writing calls turn the breakdown into the four pieces Tyler
 * picked: why it works, a script for the project's topic, 3 to 5 more ideas,
 * and a title with hashtags. Each piece is its own call under its own meter
 * name, so the AI usage page can show what each one costs. They run side by
 * side, so the wait is the longest one, not the four added up.
 *
 * An analysis is kept with the topic it was written for. Analysing again with
 * another topic adds a second one; the first stays.
 */

const roleEnum = z.enum(SEGMENT_ROLES).catch("other")

const whySchema = z.object({
  hook: z.string().min(1).max(2_000),
  parts: z.array(z.object({ role: roleEnum, summary: z.string().max(2_000) })).max(30),
  whySpread: z.string().min(1).max(3_000),
})
const scriptSchema = z.object({
  script: z
    .array(z.object({ role: roleEnum, seconds: z.number().finite().min(0).max(3_600), words: z.string().min(1).max(4_000) }))
    .min(1)
    .max(30),
})
const ideasSchema = z.object({
  ideas: z.array(z.object({ idea: z.string().min(1).max(600), hook: z.string().min(1).max(400) })).min(3).max(5),
})
const titleSchema = z.object({
  title: z.string().min(1).max(200),
  caption: z.string().max(2_200),
  hashtags: z.array(z.string().max(60)).max(30),
})

/** What one analysis costs, roughly, before it runs: shown in the Analyse box. */
export type AnalysisPrice = { cents: number; breakdownNeeded: boolean }

/**
 * Gemini counts about 300 tokens a second of video. The breakdown writes
 * about 2,000 tokens; each of the four writing calls reads the breakdown
 * (about 3,000) and writes about 800. Flash's price is in `ai-models.ts`.
 */
export function analysisPrice(durationSeconds: number | null, breakdownReady: boolean): AnalysisPrice {
  const price = AI_MODEL_PRICES[WRITER_MODEL]
  const cost = (input: number, output: number) =>
    (input / 1_000_000) * price.inputPerMillion + (output / 1_000_000) * price.outputPerMillion
  const seconds = Math.max(15, Math.min(durationSeconds ?? 60, 600))
  const breakdown = breakdownReady ? 0 : cost(seconds * 300 + 800, 2_000)
  const writing = 4 * cost(3_000, 800)
  return { cents: Math.max(1, Math.ceil((breakdown + writing) * 100)), breakdownNeeded: !breakdownReady }
}

function describeOriginal(row: Pick<ViralVideoRow, "title" | "channelName" | "views" | "subscribers">, breakdown: ViralBreakdown) {
  const parts = breakdown.segments
    .map((segment) => {
      const words = breakdown.transcript
        .filter((line) => line.startMs < segment.endMs && line.endMs > segment.startMs)
        .map((line) => line.text.trim())
        .filter(Boolean)
        .join(" ")
      const seconds = Math.max(1, Math.round((segment.endMs - segment.startMs) / 1000))
      return `- ${segment.role} (${seconds}s): ${segment.summary}${words ? `\n  Said or shown: "${words.slice(0, 1_500)}"` : ""}`
    })
    .join("\n")
  return `Title: ${row.title ?? "(none)"}
Channel: ${row.channelName ?? "(unknown)"}, ${row.subscribers ?? "unknown"} followers, ${row.views ?? "unknown"} views.
Its parts, in order:
${parts || "- (no parts were found)"}`
}

const ANSWER_ONLY = "Answer with JSON only, in exactly this shape, and nothing else:"

function whyPrompt(original: string) {
  return `A short social video went viral. Explain to a creator, in plain words, why it works.

${original}

${ANSWER_ONLY}
{ "hook": "what the opening does to stop the scroll", "parts": [{ "role": "hook", "summary": "what this part does" }], "whySpread": "what made people watch to the end and share it" }
List the parts in the video's own order, one entry per part above, using the same roles.`
}

function scriptPrompt(original: string, topic: string, roles: SegmentRole[]) {
  return `Rewrite this viral short video as a new script for somebody else's subject, keeping its shape: the same kind of hook, the same parts in the same order, each about as long in seconds as the original's.

The original:
${original}

The new subject, in their words: """${topic}"""

${ANSWER_ONLY}
{ "script": [{ "role": "hook", "seconds": 3, "words": "what is said and shown" }] }
The script must have exactly these parts, in this order: ${roles.join(", ")}.`
}

function ideasPrompt(original: string, topic: string) {
  return `A short video went viral. Suggest 3 to 5 more video ideas in the same style, for somebody whose subject is: """${topic}"""

The original:
${original}

${ANSWER_ONLY}
{ "ideas": [{ "idea": "one sentence saying what the video is", "hook": "its opening line" }] }`
}

function titlePrompt(original: string, topic: string) {
  return `Write a title, a caption and hashtags for a new short video copying this viral one's style, about: """${topic}"""

The original:
${original}

${ANSWER_ONLY}
{ "title": "under 70 characters", "caption": "one or two short sentences", "hashtags": ["#example"] }`
}

function cleanTopic(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, ANALYSIS_TOPIC_MAX)
}

function toAnalysis(row: typeof viralAnalyses.$inferSelect): ViralAnalysis {
  return { id: row.id, topic: row.topic, pieces: row.pieces, notes: row.notes, createdAt: row.createdAt.toISOString() }
}

/**
 * Writes the four pieces for a saved video that already has its breakdown,
 * and keeps them. Refuses a script that leaves out any of the original's
 * parts, because then it isn't the same shape.
 */
export async function writeAnalysis(
  ownerId: string,
  saved: ViralVideoRow,
  project: ViralProjectRow | null,
  topicValue: string
): Promise<ViralAnalysis> {
  const breakdown = readStoredBreakdown(saved.breakdown)
  if (saved.status !== "ready" || !breakdown) throw viralSays("This video has not been broken down yet.")
  const topic = cleanTopic(topicValue)
  if (!topic) throw viralSays("Say what you make, and for whom, so the script is written for it.")
  if (project) await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, 0)

  const original = describeOriginal(saved, breakdown)
  const roles = breakdown.segments.map((segment) => segment.role)
  const metadata = { savedVideoId: saved.id, ...(project ? viralProjectSpendMetadata(project.id) : {}) }
  const ask = <T>(feature: string, prompt: string, schema: z.ZodType<T>, label: string) =>
    askWriter({ userId: ownerId, feature, metadata, prompt, schema, label })

  const [why, script, ideas, title] = await Promise.all([
    ask(ANALYSIS_FEATURES.whyItWorks, whyPrompt(original), whySchema, "Why it works"),
    ask(ANALYSIS_FEATURES.script, scriptPrompt(original, topic, roles), scriptSchema, "The script"),
    ask(ANALYSIS_FEATURES.ideas, ideasPrompt(original, topic), ideasSchema, "More ideas"),
    ask(ANALYSIS_FEATURES.title, titlePrompt(original, topic), titleSchema, "The title"),
  ])

  const missing = missingScriptParts(roles, script.script)
  if (missing.length) {
    throw viralSays(
      `The script came back missing ${missing.map((role) => `"${segmentRoleLabels[role]}"`).join(" and ")}, so it isn't the same shape as the original. Press Analyse again.`
    )
  }

  const pieces: AnalysisPieces = {
    whyItWorks: why,
    script: script.script.map((part) => ({ ...part, seconds: Math.round(part.seconds) })),
    ideas: ideas.ideas,
    title: { ...title, hashtags: title.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)) },
  }
  const at = now()
  const [row] = await db
    .insert(viralAnalyses)
    .values({ id: uuid(), ownerId, savedVideoId: saved.id, projectId: project?.id ?? null, topic, pieces, createdAt: at, updatedAt: at })
    .returning()
  await db.update(viralVideos).set({ analysisError: null }).where(eq(viralVideos.id, saved.id))
  return toAnalysis(row)
}

export type AnalyseResult =
  | { state: "written"; analysis: ViralAnalysis; savedVideo: SavedVideoDetail }
  /** The video is downloading or being watched; the worker writes the analysis when the breakdown lands. */
  | { state: "waiting"; savedVideo: SavedVideoDetail }

/**
 * The Analyse button. A video already broken down is written about at once.
 * Any other is saved for breaking down, with the topic kept on its row, and
 * the worker writes the analysis once Gemini has watched it, so closing the
 * page loses nothing.
 */
export async function analyseVideo(
  ownerId: string,
  input: { projectId: string; url: string; topic: string }
): Promise<AnalyseResult> {
  const project = await requireOwnedViralProject(ownerId, input.projectId)
  if (project.isSample) throw viralSays("This is a sample, so there is no real video to analyse. Make your own project first.")
  const topic = cleanTopic(input.topic)
  if (!topic) throw viralSays("Say what you make, and for whom, so the script is written for it.")
  await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, 0)

  const detail = await saveVideo(ownerId, input.url, project.id, true)
  const [row] = await db.select().from(viralVideos).where(and(eq(viralVideos.id, detail.id), eq(viralVideos.ownerId, ownerId)))
  if (row.status === "ready" && readStoredBreakdown(row.breakdown)) {
    return { state: "written", analysis: await writeAnalysis(ownerId, row, project, topic), savedVideo: detail }
  }
  await db
    .update(viralVideos)
    .set({ pendingAnalysis: { topic, projectId: project.id }, analysisError: null, updatedAt: now() })
    .where(eq(viralVideos.id, row.id))
  return { state: "waiting", savedVideo: detail }
}

/**
 * Called by the saved-video worker once a breakdown lands: writes the
 * analysis somebody asked for while it was still downloading. A failure is
 * kept on the row as a sentence, and the breakdown stands either way.
 */
export async function writePendingAnalysis(savedVideoId: string): Promise<void> {
  const [row] = await db.select().from(viralVideos).where(eq(viralVideos.id, savedVideoId))
  if (!row?.pendingAnalysis) return
  const pending = row.pendingAnalysis
  // Cleared first, so a second worker pass never writes it twice.
  const [claimed] = await db
    .update(viralVideos)
    .set({ pendingAnalysis: null })
    .where(and(eq(viralVideos.id, row.id), eq(viralVideos.pendingAnalysis, pending)))
    .returning()
  if (!claimed) return
  try {
    const project = pending.projectId ? await requireOwnedViralProject(row.ownerId, pending.projectId).catch(() => null) : null
    await writeAnalysis(row.ownerId, claimed, project, pending.topic)
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^VIRAL_SAYS: /, "") : "The analysis could not be written."
    console.error("A waiting analysis was not written", row.id, error)
    await db.update(viralVideos).set({ analysisError: message.slice(0, 500) }).where(eq(viralVideos.id, row.id))
  }
}

/** Every analysis of one saved video, newest first, with why the last one failed if it did. */
export async function listAnalyses(
  ownerId: string,
  savedVideoId: string
): Promise<{ analyses: ViralAnalysis[]; pendingTopic: string | null; error: string | null }> {
  const [row] = await db
    .select({ pending: viralVideos.pendingAnalysis, error: viralVideos.analysisError })
    .from(viralVideos)
    .where(and(eq(viralVideos.id, savedVideoId), eq(viralVideos.ownerId, ownerId)))
  if (!row) throw viralSays("That saved video is gone.")
  const rows = await db
    .select()
    .from(viralAnalyses)
    .where(and(eq(viralAnalyses.savedVideoId, savedVideoId), eq(viralAnalyses.ownerId, ownerId)))
    .orderBy(desc(viralAnalyses.createdAt))
  return { analyses: rows.map(toAnalysis), pendingTopic: row.pending?.topic ?? null, error: row.error }
}

/** The Notes box under an analysis, saved as you type. */
export async function saveAnalysisNotes(ownerId: string, analysisId: string, notes: string): Promise<void> {
  const [row] = await db
    .update(viralAnalyses)
    .set({ notes: notes.slice(0, ANALYSIS_NOTES_MAX), updatedAt: now() })
    .where(and(eq(viralAnalyses.id, analysisId), eq(viralAnalyses.ownerId, ownerId)))
    .returning({ id: viralAnalyses.id })
  if (!row) throw viralSays("That analysis is gone.")
}
