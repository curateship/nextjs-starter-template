import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { AD_COPY_AIMS, type AdCopy, type AdCopies } from "@/lib/viral/ads"
import { viralSays } from "@/lib/viral/viral"
import { roundedCents, writerDollars, type Writer, type WriterPrice } from "@/lib/viral/writers"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { cleanTopic } from "@/server/viral/ai-analysis"
import { requireViralProjectBudget, viralProjectSpendMetadata } from "@/server/viral/project-spend"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { viralAdCopies, viralAds, type ViralAdCopyRow } from "@/server/viral/schema"
import { askWriter } from "@/server/viral/writer"
import { writerForPrices } from "@/server/viral/writer-choice"

/**
 * Write an ad like this (`workspace/docs/winning-ads.md`, more-features task
 * part 10). Tyler, 6 Nov 2026: "Meta's three boxes". From a Winning ad's
 * words, one call to the writer picked on Settings → AI writer writes the
 * main text, the headline and the description for the project's topic, on
 * the meter as `viral_ad_copy` and counted against the project's spend limit.
 *
 * Each ad is kept by the project and the ad's library id, because a new
 * search replaces the project's ads; the written ones stay. They aim at the
 * lengths Meta shows (125, 40 and 30 characters) and are never refused for
 * going over.
 */

export const AD_COPY_FEATURE = "viral_ad_copy"

/** One call: about 900 tokens in (the ad, the topic, the question) and 300 out. */
export function adCopyPrice(writer: Writer): WriterPrice {
  return { cents: roundedCents(writerDollars(writer, 900, 300)), writer: writer.label }
}

function toAdCopy(row: ViralAdCopyRow): AdCopy {
  return { id: row.id, mainText: row.mainText, headline: row.headline, description: row.description, createdAt: row.createdAt.toISOString() }
}

/** The ads written from one Winning ad, newest first, and what the next one costs. */
export async function listAdCopies(ownerId: string, projectId: string, adArchiveId: string): Promise<AdCopies> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  const [rows, writer] = await Promise.all([
    db
      .select()
      .from(viralAdCopies)
      .where(and(eq(viralAdCopies.ownerId, ownerId), eq(viralAdCopies.projectId, project.id), eq(viralAdCopies.adArchiveId, adArchiveId)))
      .orderBy(desc(viralAdCopies.createdAt)),
    writerForPrices(),
  ])
  return { copies: rows.map(toAdCopy), price: adCopyPrice(writer) }
}

// Generous limits, far over Meta's lengths: an ad that runs long is kept, never refused.
const answerSchema = z.object({
  mainText: z.string().min(1).max(3_000),
  headline: z.string().min(1).max(500),
  description: z.string().max(500),
})

function adPrompt(ad: { pageName: string; title: string; body: string }, topic: string) {
  return `This Facebook and Instagram ad has run for over a month, so it is making its advertiser money.

Advertiser: ${ad.pageName || "(unknown)"}
Its headline: """${ad.title.slice(0, 500) || "(none)"}"""
Its main text: """${ad.body.slice(0, 3_000) || "(only a picture or video)"}"""

Write a new ad in the same style, keeping what makes it work, for somebody whose subject is: """${topic}"""
Fill Meta's three boxes. Aim at the lengths Meta shows before cutting text off: main text about ${AD_COPY_AIMS.mainText} characters, headline about ${AD_COPY_AIMS.headline}, description about ${AD_COPY_AIMS.description}. Don't copy the original's words.

Answer with JSON only, in exactly this shape, and nothing else:
{ "mainText": "the main text", "headline": "the headline", "description": "the description" }`
}

/**
 * Write an ad. The ad must be one of the project's Winning ads now; a
 * sample's made-up ads, a sample project and a project with no topic are
 * refused before the AI is asked.
 */
export async function writeAdCopy(ownerId: string, projectId: string, adArchiveId: string): Promise<AdCopy> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (project.isSample || adArchiveId.startsWith("sample-")) {
    throw viralSays("A sample's ads are made up, so nothing is written from them. Search ads in your own project to try it.")
  }
  const [ad] = await db
    .select()
    .from(viralAds)
    .where(and(eq(viralAds.ownerId, ownerId), eq(viralAds.projectId, project.id), eq(viralAds.adArchiveId, adArchiveId)))
    .limit(1)
  if (!ad) throw viralSays("That ad is no longer in this project's Winning ads. Press Search ads and pick one again.")
  const topic = cleanTopic(project.topic)
  if (!topic) throw viralSays(`"${project.name}" has no topic yet. Set Your topic in its ⋮ first, so the ad is written for it.`)
  await requireViralProjectBudget(ownerId, project.id, project.spendLimitCents, adCopyPrice(await writerForPrices()).cents)

  const answer = await askWriter({
    userId: ownerId,
    feature: AD_COPY_FEATURE,
    metadata: { adArchiveId: ad.adArchiveId, ...viralProjectSpendMetadata(project.id) },
    prompt: adPrompt(ad, topic),
    schema: answerSchema,
    label: "The ad",
  })
  const [row] = await db
    .insert(viralAdCopies)
    .values({
      id: uuid(),
      ownerId,
      projectId: project.id,
      adArchiveId: ad.adArchiveId,
      mainText: answer.mainText.trim(),
      headline: answer.headline.trim(),
      description: answer.description.trim(),
      createdAt: now(),
    })
    .returning()
  return toAdCopy(row)
}
