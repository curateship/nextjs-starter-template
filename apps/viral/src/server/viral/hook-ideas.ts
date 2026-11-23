import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { HOOK_IDEAS_COUNT, type HookIdeas, type HookKind } from "@/lib/viral/library"
import { hookLine } from "@/lib/viral/viral-breakdown"
import { viralSays } from "@/lib/viral/viral"
import { roundedCents, writerDollars, type Writer, type WriterPrice } from "@/lib/viral/writers"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { readStoredBreakdown } from "@/server/viral/analysis"
import { cleanTopic } from "@/server/viral/ai-analysis"
import { requireOwnHook } from "@/server/viral/own-hooks"
import { requireViralProjectBudget, viralProjectSpendMetadata } from "@/server/viral/project-spend"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { viralHookIdeas, viralProjects, viralVideos } from "@/server/viral/schema"
import { askWriter } from "@/server/viral/writer"
import { writerForPrices } from "@/server/viral/writer-choice"

/**
 * Write hooks like this (`workspace/docs/library.md`, more-features task part
 * 6). Tyler, 6 Nov 2026: "Kept under the hook". Five new hooks in the style
 * of one hook in the Library, an analysed video's or your own, written for a
 * project's topic by the writer picked on Settings → AI writer. One call, on
 * the meter as `viral_hook_ideas`, counted against that project's spend
 * limit. Every press is kept under the hook, newest first.
 */

export const HOOK_IDEAS_FEATURE = "viral_hook_ideas"

/** One call: about 600 tokens in (the hook, the topic, the question) and 250 out. */
export function hookIdeasPrice(writer: Writer): WriterPrice {
  return { cents: roundedCents(writerDollars(writer, 600, 250)), writer: writer.label }
}

type HookRef = { kind: HookKind; hookId: string }

/** The hook's words, once the hook is proven to be this person's. */
async function hookWords(ownerId: string, ref: HookRef): Promise<string> {
  if (ref.kind === "own") return (await requireOwnHook(ownerId, ref.hookId)).words
  const [video] = await db
    .select({ breakdown: viralVideos.breakdown })
    .from(viralVideos)
    .where(and(eq(viralVideos.id, ref.hookId), eq(viralVideos.ownerId, ownerId)))
  if (!video) throw viralSays("That hook's video is gone.")
  const breakdown = readStoredBreakdown(video.breakdown)
  const line = breakdown ? hookLine(breakdown) : null
  if (!line) throw viralSays("This video's hook has no words to copy the style of.")
  return line.text
}

function whereHook(ownerId: string, ref: HookRef) {
  return and(
    eq(viralHookIdeas.ownerId, ownerId),
    ref.kind === "own" ? eq(viralHookIdeas.ownHookId, ref.hookId) : eq(viralHookIdeas.savedVideoId, ref.hookId)
  )
}

/** Every press of Write hooks like this on one hook, newest first. */
export async function listHookIdeas(ownerId: string, ref: HookRef): Promise<HookIdeas[]> {
  await hookWords(ownerId, ref)
  const rows = await db.select().from(viralHookIdeas).where(whereHook(ownerId, ref)).orderBy(desc(viralHookIdeas.createdAt))
  const projectIds = [...new Set(rows.flatMap((row) => (row.projectId ? [row.projectId] : [])))]
  const names = new Map(
    (projectIds.length
      ? await db
          .select({ id: viralProjects.id, name: viralProjects.name })
          .from(viralProjects)
          .where(and(eq(viralProjects.ownerId, ownerId), inArray(viralProjects.id, projectIds)))
      : []
    ).map((row) => [row.id, row.name])
  )
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectId ? (names.get(row.projectId) ?? null) : null,
    hooks: row.hooks,
    createdAt: row.createdAt.toISOString(),
  }))
}

const answerSchema = z.object({ hooks: z.array(z.string().min(1).max(400)).min(HOOK_IDEAS_COUNT).max(HOOK_IDEAS_COUNT * 2) })

function ideasPrompt(hook: string, topic: string) {
  return `Here is the opening line, the hook, of a short social video that worked: """${hook.slice(0, 600)}"""

Write ${HOOK_IDEAS_COUNT} new hooks in exactly the same style, the same kind of opening, about the same length, for somebody whose subject is: """${topic}"""
Each one is a line a creator could say in the first three seconds. Don't copy the original's words.

Answer with JSON only, in exactly this shape, and nothing else:
{ "hooks": ["the first hook", "the second hook"] }
Give exactly ${HOOK_IDEAS_COUNT} hooks.`
}

/**
 * Write 5 hooks. A sample project and a project with no topic are refused
 * before the AI is asked, as Write a script on a format refuses them.
 */
export async function writeHookIdeas(ownerId: string, input: HookRef & { projectId: string }): Promise<HookIdeas> {
  const words = await hookWords(ownerId, input)
  const project = await requireOwnedViralProject(ownerId, input.projectId)
  if (project.isSample) throw viralSays("This is a sample project, so nothing is written for it. Pick one of your own projects.")
  const topic = cleanTopic(project.topic)
  if (!topic) throw viralSays(`"${project.name}" has no topic yet. Set Your topic in its ⋮ first, so the hooks are written for it.`)
  await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, hookIdeasPrice(await writerForPrices()).cents)

  const answer = await askWriter({
    userId: ownerId,
    feature: HOOK_IDEAS_FEATURE,
    metadata: { hookKind: input.kind, hookId: input.hookId, ...viralProjectSpendMetadata(project.id) },
    prompt: ideasPrompt(words, topic),
    schema: answerSchema,
    label: "The hooks",
  })
  const hooks = answer.hooks.map((one) => one.trim().replace(/\s+/g, " ")).slice(0, HOOK_IDEAS_COUNT)
  const [row] = await db
    .insert(viralHookIdeas)
    .values({
      id: uuid(),
      ownerId,
      savedVideoId: input.kind === "video" ? input.hookId : null,
      ownHookId: input.kind === "own" ? input.hookId : null,
      projectId: project.id,
      hooks,
      createdAt: now(),
    })
    .returning()
  return { id: row.id, projectId: project.id, projectName: project.name, hooks: row.hooks, createdAt: row.createdAt.toISOString() }
}
