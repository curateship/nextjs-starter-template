import { and, eq } from "drizzle-orm"

import type { FormatPart } from "@/lib/viral/formats"
import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { viralFormats } from "@/server/viral/schema"

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

const SAMPLE_FORMAT_NAME = "Sample: mistake hook, three tips, the ask"

const SAMPLE_FORMAT_PARTS: FormatPart[] = [
  { role: "hook", seconds: 3, summary: "Names a mistake the viewer is making right now." },
  { role: "problem", seconds: 6, summary: "Shows what the mistake costs them." },
  { role: "solution", seconds: 15, summary: "Three quick fixes, one shot each." },
  { role: "cta", seconds: 4, summary: "Asks them to save it for later." },
]

/**
 * The sample project's Library piece: one saved format, kept once per
 * person, however often the sample is made again.
 */
export async function addSampleLibrary(tx: Tx, ownerId: string, at: Date) {
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
}
