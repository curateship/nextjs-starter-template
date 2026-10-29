import { and, desc, eq, sql } from "drizzle-orm"

import {
  projectSpendLimitMessage,
  projectSpendToolLabel,
  type ProjectSpend,
} from "@/lib/video/project-spend"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"
import { getOwnedProject } from "@/server/video/projects"

/**
 * What one project has spent on AI, read off the shell's meter. Every AI call
 * made for a project writes `projectId` into its row's metadata, so this is a
 * sum over those rows and nothing else is kept. Calls made before a tool
 * started naming the project are not in it.
 */

/** The metadata every AI call made for a project carries. */
export function projectSpendMetadata(projectId: string) {
  return { projectId }
}

/**
 * What a Viral project's AI calls carry. A different key from an editor
 * project's, because the two kinds of project are different tables and an id
 * must never be read as the other kind.
 */
export function viralProjectSpendMetadata(viralProjectId: string) {
  return { viralProjectId }
}

type SpendKey = "projectId" | "viralProjectId"

async function spentByTool(
  userId: string,
  projectId: string,
  database: CustomShellDb,
  key: SpendKey = "projectId"
) {
  return database
    .select({
      feature: customShellAiUsageEvents.feature,
      cents: sql<number>`coalesce(sum(${customShellAiUsageEvents.costCents}), 0)::int`,
    })
    .from(customShellAiUsageEvents)
    .where(
      and(
        eq(customShellAiUsageEvents.userId, userId),
        sql`${customShellAiUsageEvents.metadata} ->> ${key} = ${projectId}`
      )
    )
    .groupBy(customShellAiUsageEvents.feature)
    .orderBy(desc(sql`2`))
}

export async function readProjectSpend(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectSpend> {
  const project = await getOwnedProject(userId, projectId, database)
  const rows = await spentByTool(userId, projectId, database)
  // Two meter names can share a label, so lines are added up by label.
  const byLabel = new Map<string, number>()
  for (const row of rows) {
    const label = projectSpendToolLabel(row.feature)
    byLabel.set(label, (byLabel.get(label) ?? 0) + row.cents)
  }
  const byTool = [...byLabel]
    .map(([label, cents]) => ({ label, cents }))
    .filter((line) => line.cents > 0)
    .sort((a, b) => b.cents - a.cents)
  return {
    total_cents: byTool.reduce((sum, line) => sum + line.cents, 0),
    by_tool: byTool,
    limit_cents: project.spendLimitCents,
  }
}

/**
 * Refuses an AI call that would take the project past its limit, before the
 * call is made. The project is looked up as the caller's own, so this is also
 * the ownership check for any tool that names a project.
 *
 * `nextCents` is what the call will cost when that is known up front (a
 * picture, a clip, a voice). A call priced by the words it writes cannot be
 * known first, so it passes 0 and is refused only once the limit is reached.
 * `generatingCents` is what AI shots already being made will add when they
 * arrive, which the meter does not hold yet.
 */
export async function requireProjectBudget(
  userId: string,
  projectId: string,
  nextCents: number,
  database: CustomShellDb = db,
  generatingCents = 0
) {
  const project = await getOwnedProject(userId, projectId, database)
  await refuseOverLimit(
    await spentByTool(userId, projectId, database),
    project.spendLimitCents,
    nextCents,
    generatingCents
  )
}

/**
 * Refuses a Viral project's AI call that would pass its limit. The caller has
 * already proven the project is theirs and read its limit.
 */
export async function requireViralProjectBudget(
  ownerId: string,
  viralProjectId: string,
  limitCents: number | null,
  nextCents: number,
  database: CustomShellDb = db
) {
  if (limitCents === null) return
  await refuseOverLimit(
    await spentByTool(ownerId, viralProjectId, database, "viralProjectId"),
    limitCents,
    nextCents
  )
}

async function refuseOverLimit(
  rows: { cents: number }[],
  limitCents: number | null,
  nextCents: number,
  generatingCents = 0
) {
  if (limitCents === null) return
  const spentCents = rows.reduce((sum, row) => sum + row.cents, 0)
  const over =
    nextCents > 0
      ? spentCents + generatingCents + nextCents > limitCents
      : spentCents >= limitCents
  if (over) {
    throw new Error(
      projectSpendLimitMessage({ spentCents, generatingCents, nextCents, limitCents })
    )
  }
}
