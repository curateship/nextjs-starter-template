import { and, desc, eq, sql } from "drizzle-orm"

import {
  projectSpendLimitMessage,
  projectSpendToolLabel,
  type VideoSpend,
} from "@/lib/video/project-spend"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"
import { getOwnedVideo } from "@/server/video/project-videos"
import type { VideoProjectVideoRow } from "@/server/video/schema"

/**
 * What one video has spent on AI, read off the shell's meter. Every AI call
 * made in the editor writes the project's id and the open video's id into
 * its row's metadata, so this is a sum over those rows and nothing else is
 * kept. Each video has its own limit (Tyler, 1 Nov 2026); work the whole
 * project shares, such as a first frame or an AI shot, is paid for by the
 * video that was open when it was made. Calls made before a tool started
 * naming the video are not in it. Migration 0145 gave every older row that
 * named a project the id of that project's only video.
 */

/**
 * What an AI call writes into its meter row so a spend line counts it: the
 * project, and the video when one was open. A picture made from the Actors
 * page with a project's look names the project only.
 */
export type SpendTag = { projectId: string; videoId?: string }

/** The metadata every AI call made in the editor carries. */
export function videoSpendMetadata(
  video: Pick<VideoProjectVideoRow, "id" | "projectId">
): SpendTag {
  return { projectId: video.projectId, videoId: video.id }
}

type SpendKey = "projectId" | "videoId"

async function spentByTool(
  userId: string,
  id: string,
  database: CustomShellDb,
  key: SpendKey
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
        sql`${customShellAiUsageEvents.metadata} ->> ${key} = ${id}`
      )
    )
    .groupBy(customShellAiUsageEvents.feature)
    .orderBy(desc(sql`2`))
}

export async function readVideoSpend(
  userId: string,
  videoId: string,
  database: CustomShellDb = db
): Promise<VideoSpend> {
  const video = await getOwnedVideo(userId, videoId, database)
  const [rows, projectRows] = await Promise.all([
    spentByTool(userId, video.id, database, "videoId"),
    spentByTool(userId, video.projectId, database, "projectId"),
  ])
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
    limit_cents: video.spendLimitCents,
    project_total_cents: projectRows.reduce((sum, row) => sum + row.cents, 0),
  }
}

/**
 * Refuses an AI call that would take the video past its limit, before the
 * call is made. The video is looked up as the caller's own, so this is also
 * the ownership check for any tool that names a video, and it hands the row
 * back for the call's metadata.
 *
 * `nextCents` is what the call will cost when that is known up front (a
 * picture, a clip, a voice). A call priced by the words it writes cannot be
 * known first, so it passes 0 and is refused only once the limit is reached.
 * `generatingCents` is what AI shots already being made for the video will
 * add when they arrive, which the meter does not hold yet.
 */
export async function requireVideoBudget(
  userId: string,
  videoId: string,
  nextCents: number,
  database: CustomShellDb = db,
  generatingCents = 0
): Promise<VideoProjectVideoRow> {
  const video = await getOwnedVideo(userId, videoId, database)
  await refuseOverLimit(
    await spentByTool(userId, video.id, database, "videoId"),
    video.spendLimitCents,
    nextCents,
    generatingCents
  )
  return video
}

async function refuseOverLimit(
  rows: { cents: number }[],
  limitCents: number | null,
  nextCents: number,
  generatingCents: number
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
