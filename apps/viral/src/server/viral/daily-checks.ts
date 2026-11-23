import { and, asc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm"

import { MANUAL_UNITS_RESERVE, unitsPerKeyword, type ViralVideoLength } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import { creatorWatchEnabled } from "@/server/viral/creators/watch"
import { OUTLIER_UNITS_PER_SEARCH_MAX } from "@/server/viral/outliers"
import { getYoutubeApiKey } from "@/server/viral/settings"
import {
  viralNotifiedVideos,
  viralProjectKeywords,
  viralProjectResults,
  viralProjects,
  type ViralProjectRow,
} from "@/server/viral/schema"
import { scoreVideos } from "@/server/viral/project-view"
import { queuedKeywordUnits, youtubeUnitsLeftToday } from "@/server/viral/youtube-units"

/**
 * The daily re-check (`workspace/docs/finding-content.md`). Tyler, 4 Nov
 * 2026: "Daily, with a bell". Each project's YouTube keywords are searched
 * again once a day, and when the run ends the bell rings once for that
 * project, naming how many new videos passed its minimum score. Creators are
 * read every 6 hours by the creator watch (`creators/watch.ts`).
 *
 * Off unless `VIRAL_WATCH_ENABLED=1`, the same switch as the creator watch,
 * so a developer's machine never searches on its own. A run always leaves
 * 1,000 of the day's 10,000 YouTube units free, so a search somebody presses
 * still works. The price of a run counts the Outlier reads each keyword's
 * search makes afterwards, so those never dip into the 1,000 either.
 */

/** How long after a keyword's last run it is due again. */
const RECHECK_EVERY_MS = 24 * 60 * 60 * 1000

/** How many projects one tick queues. The search worker then takes 5 keywords a tick. */
const PROJECTS_PER_TICK = 3

/** The most one keyword of an automatic run can spend: its search, then its Outlier reads. */
function unitsPerRecheck(length: ViralVideoLength) {
  return unitsPerKeyword(length) + OUTLIER_UNITS_PER_SEARCH_MAX
}

export async function dailyRecheckTick(at: Date = now()): Promise<void> {
  if (!creatorWatchEnabled()) return
  if (!(await getYoutubeApiKey().catch(() => null))) return
  await ringFinishedRuns()

  // Only projects that search YouTube and have not paused it, longest
  // waiting first, so the ones skipped never crowd out the rest.
  const due = await db
    .select({ project: viralProjects })
    .from(viralProjects)
    .innerJoin(viralProjectKeywords, eq(viralProjectKeywords.projectId, viralProjects.id))
    .where(
      and(
        isNull(viralProjects.archivedAt),
        eq(viralProjects.isSample, false),
        isNull(viralProjects.watchRunAt),
        sql`${viralProjects.socials} @> '["youtube"]'::jsonb`,
        sql`not (${viralProjects.pausedSocials} @> '["youtube"]'::jsonb)`,
        notInArray(viralProjectKeywords.status, ["queued", "searching"]),
        or(
          isNull(viralProjectKeywords.ranAt),
          lt(viralProjectKeywords.ranAt, new Date(at.getTime() - RECHECK_EVERY_MS))
        )
      )
    )
    .groupBy(viralProjects.id)
    .orderBy(asc(sql`min(coalesce(${viralProjectKeywords.ranAt}, 'epoch'::timestamptz))`))
    .limit(PROJECTS_PER_TICK * 4)

  let queuedProjects = 0
  for (const { project } of due) {
    if (queuedProjects >= PROJECTS_PER_TICK) break
    if (await queueProjectRecheck(project, at)) queuedProjects += 1
  }
}

/**
 * A run whose last keyword was taken off before it was searched never
 * reaches the search worker's end, so its mark would stay and the project
 * would never be re-checked again. Each tick rings, and clears, any run with
 * nothing left waiting. The bell's own conditional clear means a run the
 * search worker finishes at the same moment still rings once.
 */
async function ringFinishedRuns() {
  const marked = await db
    .select({ id: viralProjects.id })
    .from(viralProjects)
    .where(
      and(
        isNotNull(viralProjects.watchRunAt),
        sql`not exists (select 1 from ${viralProjectKeywords} where ${viralProjectKeywords.projectId} = ${viralProjects.id} and ${viralProjectKeywords.status} in ('queued', 'searching'))`
      )
    )
  for (const project of marked) {
    await ringRecheckBell(project.id).catch((error) => console.error("A finished re-check's bell did not ring", project.id, error))
  }
}

/**
 * Queues every idle keyword of one project and marks the run, so its end
 * rings the bell. Refused, quietly, when the day's units would dip into the
 * reserve. Answers whether anything was queued.
 */
async function queueProjectRecheck(project: ViralProjectRow, at: Date): Promise<boolean> {
  const keywords = await db
    .select({ id: viralProjectKeywords.id })
    .from(viralProjectKeywords)
    .where(
      and(
        eq(viralProjectKeywords.projectId, project.id),
        notInArray(viralProjectKeywords.status, ["queued", "searching"])
      )
    )
  if (!keywords.length) return false
  const cost = keywords.length * unitsPerRecheck(project.videoLength as ViralVideoLength)
  const left = (await youtubeUnitsLeftToday(at)) - (await unitsAlreadyQueued())
  if (left - cost < MANUAL_UNITS_RESERVE) return false

  return db.transaction(async (tx) => {
    // Claimed by the mark, so two overlapping ticks queue a project once.
    const [claimed] = await tx
      .update(viralProjects)
      .set({ watchRunAt: at })
      .where(and(eq(viralProjects.id, project.id), isNull(viralProjects.watchRunAt)))
      .returning({ id: viralProjects.id })
    if (!claimed) return false
    await tx
      .update(viralProjectKeywords)
      .set({ status: "queued", error: null, queuedAt: at })
      .where(
        and(
          inArray(
            viralProjectKeywords.id,
            keywords.map((keyword) => keyword.id)
          ),
          notInArray(viralProjectKeywords.status, ["queued", "searching"])
        )
      )
    return true
  })
}

/** What the keywords already waiting anywhere will spend, their Outlier reads included. */
async function unitsAlreadyQueued(): Promise<number> {
  const queued = await queuedKeywordUnits()
  return queued.searchUnits + queued.keywords * OUTLIER_UNITS_PER_SEARCH_MAX
}

/**
 * Called when a project's last waiting keyword is done. If the daily re-check
 * started the run, rings the bell once for the new videos that pass the
 * project's minimum score and were never named before, then clears the mark.
 * A run with nothing new rings nothing. Answers how many videos it named.
 */
export async function ringRecheckBell(projectId: string): Promise<number> {
  const [project] = await db.select().from(viralProjects).where(eq(viralProjects.id, projectId))
  if (!project?.watchRunAt) return 0
  // Cleared first: a bell that fails to write is not worth ringing twice.
  const [cleared] = await db
    .update(viralProjects)
    .set({ watchRunAt: null })
    .where(and(eq(viralProjects.id, projectId), eq(viralProjects.watchRunAt, project.watchRunAt)))
    .returning({ id: viralProjects.id })
  if (!cleared) return 0

  const fresh = await db
    .select()
    .from(viralProjectResults)
    .where(and(eq(viralProjectResults.projectId, projectId), eq(viralProjectResults.isNew, true)))
  if (!fresh.length) return 0
  const scored = await scoreVideos(
    project.ownerId,
    fresh.map((row) => ({
      platform: "youtube" as const,
      platformVideoId: row.platformVideoId,
      url: row.url,
      title: row.title,
      channelId: row.channelId,
      channelName: row.channelName,
      subscribers: row.subscribers,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      postedAt: row.postedAt?.toISOString() ?? null,
      durationSeconds: row.durationSeconds,
      thumbnailUrl: row.thumbnailUrl,
      keywords: [],
      isNew: true,
      topicMatch: row.topicMatch,
      source: "search" as const,
      sample: false,
    }))
  )
  const passing = [...new Set(scored.filter((video) => video.score.score >= project.minScore).map((video) => video.platformVideoId))]
  if (!passing.length) return 0

  const named = await db
    .insert(viralNotifiedVideos)
    .values(passing.map((platformVideoId) => ({ projectId, platform: "youtube", platformVideoId, notifiedAt: now() })))
    .onConflictDoNothing()
    .returning({ platformVideoId: viralNotifiedVideos.platformVideoId })
  if (!named.length) return 0

  const videos = named.length === 1 ? "1 new video" : `${named.length} new videos`
  try {
    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: project.ownerId,
      type: "app_activity",
      message: `${videos} above ${project.minScore} in ${project.name}`.slice(0, 300),
      detail: "Open the project in Viral to watch them.",
      createdAt: now(),
    })
    await publishNotificationCreated(project.ownerId)
  } catch (error) {
    console.error("The daily re-check's notice was not recorded", projectId, error)
  }
  return named.length
}
