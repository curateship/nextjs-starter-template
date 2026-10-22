import { eq } from "drizzle-orm"

import { scenesOfTimeline } from "@/lib/video/export-scenes"
import {
  channelChangedMessage,
  EXPORT_NOT_POSTABLE_MESSAGE,
  EXPORT_NOT_POSTED_MESSAGE,
  notYourVideoMessage,
  readYoutubeVideoId,
  YOUTUBE_VIDEO_NOT_FOUND_MESSAGE,
  youtubeVideoUrl,
  type ExportRetention,
  type RetentionPoint,
} from "@/lib/video/retention"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedExport } from "@/server/video/exports"
import { videoExportYoutube, videoProjects, videoSettings } from "@/server/video/schema"
import { parseIsoDuration } from "@/server/video/viral/youtube"
import { youtubeAccess, youtubeJson } from "@/server/video/youtube-oauth"

/**
 * The retention curve of an export that was posted on YouTube
 * (`workspace/docs/retention-curve.md`).
 *
 * Pasting the link checks the video is on the connected channel (one YouTube
 * Data API read) and then reads the figures. Reading the figures is two
 * YouTube Analytics reads, because YouTube answers the curve and the totals
 * from two different reports: the curve by how far into the video, and the
 * views and typical view length for the whole video. Both are kept on the
 * export with the time they were read. Opening the export again reads them
 * from the database and asks YouTube nothing; only Refresh asks again.
 */

const ANALYTICS_REPORTS = "https://youtubeanalytics.googleapis.com/v2/reports"
const DATA_API = "https://www.googleapis.com/youtube/v3"

/** YouTube answers the curve at 100 points; anything past that is not the curve. */
const MAX_POINTS = 100

type JobRow = Awaited<ReturnType<typeof getOwnedExport>>

/** A finished video export of this person's, or the refusal in words. */
async function requirePostableExport(
  userId: string,
  exportId: string,
  database: CustomShellDb
) {
  const job = await getOwnedExport(userId, exportId, database)
  if (job.kind !== "video" || job.status !== "ready") {
    throw new Error(EXPORT_NOT_POSTABLE_MESSAGE)
  }
  return job
}

export async function getExportRetention(
  userId: string,
  exportId: string,
  database: CustomShellDb = db
): Promise<ExportRetention> {
  const job = await getOwnedExport(userId, exportId, database)
  return describeRetention(job, database)
}

/**
 * Takes the pasted link, checks the video is the connected channel's own and
 * keeps it on the export, then reads its figures. The link is kept even when
 * the figures cannot be read yet, and Refresh tries again.
 */
export async function postExportOnYoutube({
  userId,
  exportId,
  pasted,
  database = db,
  fetchFn = fetch,
}: {
  userId: string
  exportId: string
  pasted: string
  database?: CustomShellDb
  fetchFn?: typeof fetch
}): Promise<ExportRetention> {
  const job = await requirePostableExport(userId, exportId, database)
  const videoId = readYoutubeVideoId(pasted)
  const { accessToken, connection } = await youtubeAccess(database, fetchFn)

  const answer = await youtubeJson(
    fetchFn,
    `${DATA_API}/videos?${new URLSearchParams({
      part: "snippet,contentDetails",
      id: videoId,
    })}`,
    accessToken
  )
  const video = Array.isArray(answer.items)
    ? (answer.items[0] as Record<string, unknown> | undefined)
    : undefined
  if (!video) throw new Error(YOUTUBE_VIDEO_NOT_FOUND_MESSAGE)
  const snippet = (video.snippet ?? {}) as Record<string, unknown>
  const details = (video.contentDetails ?? {}) as Record<string, unknown>
  if (snippet.channelId !== connection.channelId) {
    throw new Error(notYourVideoMessage(connection.channelTitle))
  }
  const publishedAt =
    typeof snippet.publishedAt === "string" &&
    !Number.isNaN(Date.parse(snippet.publishedAt))
      ? new Date(snippet.publishedAt)
      : now()
  const title =
    (typeof snippet.title === "string" && snippet.title.trim().slice(0, 200)) ||
    videoId
  const lengthSeconds =
    parseIsoDuration(
      typeof details.duration === "string" ? details.duration : undefined
    ) ?? Math.round((job.durationMs ?? 0) / 1000)

  const timestamp = now()
  const posted = {
    youtubeVideoId: videoId,
    channelId: connection.channelId,
    videoTitle: title,
    publishedAt,
    lengthSeconds,
    // A different video's figures are not this one's.
    points: null,
    views: null,
    averageViewSeconds: null,
    readAt: null,
    updatedAt: timestamp,
  }
  await database
    .insert(videoExportYoutube)
    .values({ exportId: job.id, ...posted, createdAt: timestamp })
    .onConflictDoUpdate({ target: videoExportYoutube.exportId, set: posted })

  await readFigures(job.id, videoId, publishedAt, accessToken, database, fetchFn)
  return describeRetention(job, database)
}

/** Reads the figures again. The page's Refresh. */
export async function refreshExportRetention({
  userId,
  exportId,
  database = db,
  fetchFn = fetch,
}: {
  userId: string
  exportId: string
  database?: CustomShellDb
  fetchFn?: typeof fetch
}): Promise<ExportRetention> {
  const job = await getOwnedExport(userId, exportId, database)
  const row = await readPosted(job.id, database)
  if (!row) throw new Error(EXPORT_NOT_POSTED_MESSAGE)
  const { accessToken, connection } = await youtubeAccess(database, fetchFn)
  if (row.channelId !== connection.channelId) {
    throw new Error(channelChangedMessage(connection.channelTitle))
  }
  await readFigures(
    job.id,
    row.youtubeVideoId,
    row.publishedAt,
    accessToken,
    database,
    fetchFn
  )
  return describeRetention(job, database)
}

/** Forgets the link and the figures read for it. Nothing on YouTube changes. */
export async function removeExportYoutube(
  userId: string,
  exportId: string,
  database: CustomShellDb = db
): Promise<ExportRetention> {
  const job = await getOwnedExport(userId, exportId, database)
  await database
    .delete(videoExportYoutube)
    .where(eq(videoExportYoutube.exportId, job.id))
  return describeRetention(job, database)
}

/**
 * The two Analytics reads, kept with the time they were made. From the day
 * the video went up to today, in YouTube's own dates (UTC); a video posted
 * today asks for today alone.
 */
async function readFigures(
  exportId: string,
  videoId: string,
  publishedAt: Date,
  accessToken: string,
  database: CustomShellDb,
  fetchFn: typeof fetch
) {
  const today = now()
  const span = {
    ids: "channel==MINE",
    startDate: utcDay(publishedAt < today ? publishedAt : today),
    endDate: utcDay(today),
    filters: `video==${videoId}`,
  }
  const [curve, totals] = await Promise.all([
    youtubeJson(
      fetchFn,
      `${ANALYTICS_REPORTS}?${new URLSearchParams({
        ...span,
        metrics: "audienceWatchRatio,relativeRetentionPerformance",
        // No sort: the retention report offers none, and readPoints orders
        // the points itself.
        dimensions: "elapsedVideoTimeRatio",
      })}`,
      accessToken
    ),
    youtubeJson(
      fetchFn,
      `${ANALYTICS_REPORTS}?${new URLSearchParams({
        ...span,
        metrics: "views,averageViewDuration",
      })}`,
      accessToken
    ),
  ])

  const total = readRows(totals, ["views", "averageViewDuration"])[0]
  await database
    .update(videoExportYoutube)
    .set({
      points: readPoints(curve),
      views: total ? Math.max(0, Math.round(total.views)) : 0,
      averageViewSeconds: total
        ? Math.max(0, Math.round(total.averageViewDuration))
        : 0,
      readAt: today,
      updatedAt: today,
    })
    .where(eq(videoExportYoutube.exportId, exportId))
}

/** YouTube's rows, by column name. A row with a number missing is dropped. */
function readRows<Name extends string>(
  report: Record<string, unknown>,
  names: Name[]
): Record<Name, number>[] {
  const headers = Array.isArray(report.columnHeaders)
    ? (report.columnHeaders as { name?: unknown }[]).map((one) => one.name)
    : []
  const at = names.map((name) => headers.indexOf(name))
  if (at.some((index) => index < 0)) return []
  const rows = Array.isArray(report.rows) ? (report.rows as unknown[][]) : []
  return rows.flatMap((row) => {
    const values = at.map((index) => Number(row?.[index]))
    if (values.some((value) => !Number.isFinite(value))) return []
    return [
      Object.fromEntries(names.map((name, i) => [name, values[i]])) as Record<
        Name,
        number
      >,
    ]
  })
}

function readPoints(report: Record<string, unknown>): RetentionPoint[] {
  return readRows(report, [
    "elapsedVideoTimeRatio",
    "audienceWatchRatio",
    "relativeRetentionPerformance",
  ])
    .map((row) => ({
      ratio: row.elapsedVideoTimeRatio,
      watch: row.audienceWatchRatio,
      relative: row.relativeRetentionPerformance,
    }))
    .filter(
      (point) =>
        point.ratio >= 0 &&
        point.ratio <= 1 &&
        point.watch >= 0 &&
        point.relative >= 0 &&
        point.relative <= 1
    )
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, MAX_POINTS)
}

function utcDay(at: Date) {
  return at.toISOString().slice(0, 10)
}

async function readPosted(exportId: string, database: CustomShellDb) {
  const [row] = await database
    .select()
    .from(videoExportYoutube)
    .where(eq(videoExportYoutube.exportId, exportId))
    .limit(1)
  return row ?? null
}

/** Everything the card draws, from the database alone. */
async function describeRetention(
  job: JobRow,
  database: CustomShellDb
): Promise<ExportRetention> {
  const [row, [settings]] = await Promise.all([
    readPosted(job.id, database),
    database
      .select({ connection: videoSettings.youtubeOauth })
      .from(videoSettings)
      .where(eq(videoSettings.id, "default"))
      .limit(1),
  ])
  const connection = settings?.connection ?? null
  const lengthMs = job.durationMs ?? 0
  const kept = job.scenes
  const scenes = kept ?? (await scenesOfProjectNow(job, lengthMs, database))

  return {
    channel_title: connection?.channelTitle ?? null,
    posted: row
      ? {
          youtube_video_id: row.youtubeVideoId,
          url: youtubeVideoUrl(row.youtubeVideoId),
          video_title: row.videoTitle,
          published_at: row.publishedAt.toISOString(),
          length_seconds: row.lengthSeconds,
          other_channel: !!connection && connection.channelId !== row.channelId,
          points: row.points,
          views: row.views,
          average_view_seconds: row.averageViewSeconds,
          read_at: row.readAt ? row.readAt.toISOString() : null,
        }
      : null,
    export_length_ms: lengthMs,
    scenes,
    scenes_from_project_now: !kept,
  }
}

/**
 * An export made before exports kept their scenes is drawn against the
 * project as it is now, which the card says. A timeline that no longer reads
 * gives no scene lines rather than a failed card.
 */
async function scenesOfProjectNow(
  job: JobRow,
  lengthMs: number,
  database: CustomShellDb
) {
  if (!job.projectId) return []
  const [project] = await database
    .select({ timeline: videoProjects.timeline })
    .from(videoProjects)
    .where(eq(videoProjects.id, job.projectId))
    .limit(1)
  if (!project) return []
  try {
    return scenesOfTimeline(requireCanonicalTimeline(project.timeline), lengthMs)
  } catch {
    return []
  }
}
