import { and, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import {
  requireViralProjectBudget,
  viralProjectSpendMetadata,
} from "@/server/viral/project-spend"
import {
  viralProjectResults,
  type ViralProjectRow,
} from "@/server/viral/schema"
import { askWriter } from "@/server/viral/writer"

/**
 * How on-topic each video is: the AI reads the project's description and the
 * titles that have no match yet, and gives each a number from 0 to 100.
 *
 * One call per search run, not per look at the screen: the numbers are
 * stored on the results, and a title already matched is never sent again.
 * A project with no description has nothing to match against, so it is
 * skipped and its videos show no match.
 */

/** The most titles one call reads. The rest wait for the next run. */
const TITLES_PER_CALL = 150

const answerSchema = z.object({
  matches: z
    .array(z.object({ n: z.number().int(), match: z.number() }))
    .max(TITLES_PER_CALL),
})

export async function matchTopics(project: ViralProjectRow): Promise<number> {
  if (!project.description.trim() || project.isSample) return 0

  const rows = await db
    .select({
      platformVideoId: viralProjectResults.platformVideoId,
      title: viralProjectResults.title,
    })
    .from(viralProjectResults)
    .where(
      and(
        eq(viralProjectResults.projectId, project.id),
        isNull(viralProjectResults.topicMatch)
      )
    )
  const titles = new Map<string, string>()
  for (const row of rows) {
    if (titles.size >= TITLES_PER_CALL) break
    if (!titles.has(row.platformVideoId)) titles.set(row.platformVideoId, row.title)
  }
  if (!titles.size) return 0

  await requireViralProjectBudget(
    project.ownerId,
    project.id,
    project.spendLimitCents,
    0
  )
  const ids = [...titles.keys()]
  const answer = await askWriter({
    userId: project.ownerId,
    feature: "viral_topic_match",
    metadata: viralProjectSpendMetadata(project.id),
    prompt: topicPrompt(project.description, ids.map((id) => titles.get(id) ?? "")),
    schema: answerSchema,
    label: "The topic match",
  })

  const byMatch = new Map<number, string[]>()
  for (const { n, match } of answer.matches) {
    const id = ids[n - 1]
    if (!id) continue
    const rounded = Math.min(100, Math.max(0, Math.round(match)))
    byMatch.set(rounded, [...(byMatch.get(rounded) ?? []), id])
  }
  for (const [match, videoIds] of byMatch) {
    await db
      .update(viralProjectResults)
      .set({ topicMatch: match })
      .where(
        and(
          eq(viralProjectResults.projectId, project.id),
          inArray(viralProjectResults.platformVideoId, videoIds)
        )
      )
  }
  return [...byMatch.values()].reduce((sum, list) => sum + list.length, 0)
}

function topicPrompt(description: string, titles: string[]) {
  const numbered = titles
    .map((title, index) => `${index + 1}. ${title.replace(/\s+/g, " ").slice(0, 200)}`)
    .join("\n")
  return `Somebody is researching a niche for short social videos. Their niche, in their words:

"""${description.slice(0, 2000)}"""

Below are video titles a keyword search found. For each one, say how well it fits that niche, from 0 (nothing to do with it, for example a fishing video found by the word "hooks") to 100 (exactly the niche).

${numbered}

Answer with JSON only, in exactly this shape, and nothing else:
{ "matches": [{ "n": 1, "match": 85 }, { "n": 2, "match": 10 }] }

Give one entry per title, using its number.`
}
