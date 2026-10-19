import { z } from "zod"

import {
  VIRAL_KEYWORD_MAX,
  viralSays,
} from "@/lib/video/viral"
import {
  requireViralProjectBudget,
  viralProjectSpendMetadata,
} from "@/server/video/project-spend"
import { requireOwnedViralProject } from "@/server/video/viral/projects"
import { askWriter } from "@/server/video/writer"

/**
 * Keyword ideas from the project's description: about eight short phrases a
 * person would type into YouTube to find videos in that niche. Nothing is
 * added until the person ticks them.
 *
 * From a project that already exists, the call counts against its spend
 * limit. From the New project window there is no project yet, so it is only
 * metered.
 */

const IDEAS = 8

const answerSchema = z.object({
  keywords: z.array(z.string().max(200)).max(20),
})

export async function suggestKeywords(
  ownerId: string,
  input: { description: string; existing: string[]; projectId: string | null }
): Promise<string[]> {
  const description = input.description.trim()
  if (description.length < 10) {
    throw viralSays("Describe the niche in a sentence first, so the ideas fit it.")
  }
  let metadata: Record<string, unknown> = {}
  if (input.projectId) {
    const project = await requireOwnedViralProject(ownerId, input.projectId)
    await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, 0)
    metadata = viralProjectSpendMetadata(project.id)
  }

  const answer = await askWriter({
    userId: ownerId,
    feature: "viral_keyword_ideas",
    metadata,
    prompt: ideasPrompt(description, input.existing),
    schema: answerSchema,
    label: "Keyword ideas",
  })

  const taken = new Set(input.existing.map((one) => one.trim().toLowerCase()))
  const ideas: string[] = []
  for (const raw of answer.keywords) {
    const keyword = raw.trim().replace(/^["'#]+|["']+$/g, "").replace(/\s+/g, " ")
    const key = keyword.toLowerCase()
    if (!keyword || keyword.length > VIRAL_KEYWORD_MAX || taken.has(key)) continue
    taken.add(key)
    ideas.push(keyword)
    if (ideas.length === IDEAS) break
  }
  return ideas
}

function ideasPrompt(description: string, existing: string[]) {
  const already = existing.length
    ? `\nThey already have these, so do not repeat them: ${existing.map((one) => `"${one}"`).join(", ")}.`
    : ""
  return `Somebody wants to find the most viral short videos in a niche on YouTube. Their niche, in their words:

"""${description.slice(0, 2000)}"""
${already}
Suggest ${IDEAS} search keywords they could type into YouTube to find those videos. Each is 1 to 5 words, the way a viewer would search, with no hashtags and no quotation marks. Mix broad ones with narrow ones.

Answer with JSON only, in exactly this shape, and nothing else:
{ "keywords": ["...", "..."] }`
}
