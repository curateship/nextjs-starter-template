import { and, eq } from "drizzle-orm"

import type { FormatPart } from "@/lib/viral/formats"
import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { viralAdRuns, viralAds, viralFormats } from "@/server/viral/schema"

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

const SAMPLE_FORMAT_NAME = "Sample: mistake hook, three tips, the ask"

const SAMPLE_FORMAT_PARTS: FormatPart[] = [
  { role: "hook", seconds: 3, summary: "Names a mistake the viewer is making right now." },
  { role: "problem", seconds: 6, summary: "Shows what the mistake costs them." },
  { role: "solution", seconds: 15, summary: "Three quick fixes, one shot each." },
  { role: "cta", seconds: 4, summary: "Asks them to save it for later." },
]

/** Made-up ads for the sample project, so the Ads row has something to show. Nothing asked Meta. */
function sampleAds(ownerId: string, projectId: string, at: Date) {
  const daysAgo = (days: number) => new Date(at.getTime() - days * 24 * 60 * 60 * 1000)
  return [
    {
      pageName: "Desk Fit Daily (sample)",
      title: "The 5 minute desk reset",
      body: "Sitting all day? This 5 minute reset undoes it. Try it free for 7 days.",
      keyword: "desk stretches",
      platforms: ["facebook", "instagram"],
      startedAt: daysAgo(94),
    },
    {
      pageName: "Posture Lab (sample)",
      title: "Fix your neck in 30 days",
      body: "Our 30 day plan has helped 40,000 people stop hunching. See the plan.",
      keyword: "posture",
      platforms: ["instagram"],
      startedAt: daysAgo(41),
    },
  ].map((ad, index) => ({
    ...ad,
    id: uuid(),
    ownerId,
    projectId,
    adArchiveId: `sample-ad-${index + 1}`,
    foundAt: at,
  }))
}

/**
 * The sample project's Library and Ads pieces: one saved format (kept once
 * per person, however often the sample is made again) and two made-up ads.
 */
export async function addSampleLibrary(tx: Tx, ownerId: string, projectId: string, at: Date) {
  const [format] = await tx
    .select({ id: viralFormats.id })
    .from(viralFormats)
    .where(and(eq(viralFormats.ownerId, ownerId), eq(viralFormats.isSample, true)))
    .limit(1)
  if (!format) {
    await tx.insert(viralFormats).values({
      id: uuid(),
      ownerId,
      name: SAMPLE_FORMAT_NAME,
      parts: SAMPLE_FORMAT_PARTS,
      sourceTitle: "The sample project's analysed video",
      isSample: true,
      createdAt: at,
      updatedAt: at,
    })
  }
  await tx.insert(viralAds).values(sampleAds(ownerId, projectId, at))
  await tx.insert(viralAdRuns).values({ projectId, searchedAt: at, error: null })
}
