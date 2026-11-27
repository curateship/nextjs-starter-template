import { and, eq, sql } from "drizzle-orm"

import { projectSpendLimitMessage } from "@/lib/viral/project-spend"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"

/**
 * What a Viral project has spent on AI, read off the shell's meter. Every AI
 * call a project makes writes `{ viralProjectId }` into its meter row's
 * metadata, so the spend is a sum over those rows and nothing else is kept
 * (`workspace/docs/ai-analysis.md`).
 */

/** What a Viral project's AI calls carry on the meter. */
export function viralProjectSpendMetadata(viralProjectId: string) {
  return { viralProjectId }
}

/** What the project's AI calls have cost so far, in cents, off the meter. */
async function spentCents(userId: string, viralProjectId: string, database: CustomShellDb) {
  const [row] = await database
    .select({ cents: sql<number>`coalesce(sum(${customShellAiUsageEvents.costCents}), 0)::int` })
    .from(customShellAiUsageEvents)
    .where(
      and(
        eq(customShellAiUsageEvents.userId, userId),
        sql`${customShellAiUsageEvents.metadata} ->> 'viralProjectId' = ${viralProjectId}`
      )
    )
  return row?.cents ?? 0
}

/**
 * Refuses a Viral project's AI call that would pass its limit. The caller has
 * already proven the project is theirs and read its limit. `nextCents` is the
 * call's price when it is known up front; a call priced by the words it
 * writes passes 0 and is refused only once the limit is reached.
 */
export async function requireViralProjectBudget(
  ownerId: string,
  viralProjectId: string,
  limitCents: number | null,
  nextCents: number,
  database: CustomShellDb = db
) {
  if (limitCents === null) return
  const spent = await spentCents(ownerId, viralProjectId, database)
  const over = nextCents > 0 ? spent + nextCents > limitCents : spent >= limitCents
  if (over) throw new Error(projectSpendLimitMessage({ spentCents: spent, nextCents, limitCents }))
}
