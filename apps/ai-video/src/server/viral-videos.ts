import { and, desc, eq, inArray } from "drizzle-orm"

import { upsertCreatorFromReel } from "@/server/creators"
import { db } from "@/server/db"
import {
  cleanOriginalName,
  prepareMediaContent,
  storedFilename,
  validateMediaFile,
} from "@/server/media"
import {
  bodyToBytes,
  deleteFromR2,
  getFromR2,
  getPublicMediaUrl,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoMedia,
  aiVideoViralVideos,
  aiVideoViralVideoStats,
  type AiVideoViralVideo,
} from "@/server/schema"
import { findCurrentUser, now, uuid } from "@/server/security"
import { analyzeViralVideo, type ViralVideoAnalysis } from "@/server/video-analysis"
import {
  detectViralPlatform,
  downloadViralVideo,
  extractVideoThumbnail,
  type ViralPlatform,
} from "@/server/video-download"

export type ViralVideoStatus = "downloading" | "analyzing" | "ready" | "error"

// Engagement metadata captured from the platform at download time.
export type ViralVideoStats = {
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: string | null
}

// Archive list rows — analysis stays out of the list payload (it's large).
export type ViralVideoItem = {
  id: string
  source_url: string
  platform: ViralPlatform
  status: ViralVideoStatus
  error: string | null
  title: string | null
  author: string | null
  duration_ms: number | null
  stats: ViralVideoStats | null
  thumbnail_url: string | null
  creator_id: string | null
  // Engagement growth per day between the two most recent stat snapshots —
  // views when the platform exposes them, otherwise likes (Instagram hides
  // view counts without login). Null until a re-sync adds a second snapshot.
  trend_per_day: number | null
  created_at: string
  updated_at: string
}

// Detail payload: adds the playable media URL and the full breakdown.
export type ViralVideoDetail = ViralVideoItem & {
  media_url: string | null
  analysis: ViralVideoAnalysis | null
}

export type ViralVideoListResponse = {
  videos: ViralVideoItem[]
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
  }
  return user
}

// Owned-row lookup; throws when the video doesn't exist or isn't the user's.
async function getOwnedViralVideo(userId: string, videoId: string) {
  const [row] = await db
    .select()
    .from(aiVideoViralVideos)
    .where(
      and(
        eq(aiVideoViralVideos.id, videoId),
        eq(aiVideoViralVideos.userId, userId)
      )
    )
    .limit(1)

  if (!row) {
    throw new Error("Video not found")
  }

  return row
}

function serializeViralVideo(
  row: AiVideoViralVideo,
  trendPerDay: number | null = null
): ViralVideoItem {
  return {
    id: row.id,
    source_url: row.sourceUrl,
    platform: row.platform as ViralPlatform,
    status: row.status as ViralVideoStatus,
    error: row.error,
    title: row.title,
    author: row.author,
    duration_ms: row.durationMs,
    stats: (row.stats as ViralVideoStats | null) ?? null,
    thumbnail_url: row.thumbnailStoragePath
      ? getPublicMediaUrl(row.thumbnailStoragePath)
      : null,
    creator_id: row.creatorId,
    trend_per_day: trendPerDay,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

// Trend per video: engagement growth per day between the latest two
// snapshots — views when both have them, else likes (Instagram hides view
// counts without login, but likes still come through).
async function queryTrendPerDay(videoIds: string[]) {
  const velocity = new Map<string, number>()
  if (videoIds.length === 0) return velocity

  const snapshots = await db
    .select({
      videoId: aiVideoViralVideoStats.videoId,
      capturedAt: aiVideoViralVideoStats.capturedAt,
      views: aiVideoViralVideoStats.views,
      likes: aiVideoViralVideoStats.likes,
    })
    .from(aiVideoViralVideoStats)
    .where(inArray(aiVideoViralVideoStats.videoId, videoIds))
    .orderBy(aiVideoViralVideoStats.videoId, aiVideoViralVideoStats.capturedAt)

  // Keep the last two snapshots per video (rows arrive ordered by time).
  const lastTwo = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    const list = lastTwo.get(snapshot.videoId) ?? []
    list.push(snapshot)
    if (list.length > 2) list.shift()
    lastTwo.set(snapshot.videoId, list)
  }

  for (const [videoId, [prev, latest]] of lastTwo) {
    if (!latest) continue
    const days =
      (latest.capturedAt.getTime() - prev.capturedAt.getTime()) / 86_400_000
    if (days <= 0) continue
    const delta =
      prev.views != null && latest.views != null
        ? latest.views - prev.views
        : prev.likes != null && latest.likes != null
          ? latest.likes - prev.likes
          : null
    if (delta === null) continue
    velocity.set(videoId, Math.round(delta / days))
  }
  return velocity
}

export async function listViralVideosForCurrentUser(): Promise<ViralVideoListResponse> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(aiVideoViralVideos)
    .where(eq(aiVideoViralVideos.userId, user.id))
    .orderBy(desc(aiVideoViralVideos.createdAt))

  const velocity = await queryTrendPerDay(rows.map((row) => row.id))
  return {
    videos: rows.map((row) =>
      serializeViralVideo(row, velocity.get(row.id) ?? null)
    ),
  }
}

export async function getViralVideoForCurrentUser(
  videoId: string
): Promise<ViralVideoDetail> {
  const user = await requireUser()
  const row = await getOwnedViralVideo(user.id, videoId)

  // Resolve the playable URL from the ingested media row, if any.
  let mediaUrl: string | null = null
  if (row.mediaId) {
    const [media] = await db
      .select()
      .from(aiVideoMedia)
      .where(
        and(eq(aiVideoMedia.id, row.mediaId), eq(aiVideoMedia.userId, user.id))
      )
      .limit(1)
    if (media) {
      mediaUrl = getPublicMediaUrl(media.storagePath)
    }
  }

  return {
    ...serializeViralVideo(row),
    media_url: mediaUrl,
    analysis: (row.analysis as ViralVideoAnalysis | null) ?? null,
  }
}

export async function createViralVideoForCurrentUser(data: {
  url: string
}): Promise<ViralVideoItem> {
  requireAppOrigin()
  const user = await requireUser()
  return ingestViralVideoForUser(user.id, data.url)
}

// Session-free ingest used by both the Add Video modal (above) and the
// creator watcher, which runs on a timer without a request context.
export async function ingestViralVideoForUser(
  userId: string,
  url: string
): Promise<ViralVideoItem> {
  const platform = detectViralPlatform(url)
  const createdAt = now()

  const [created] = await db
    .insert(aiVideoViralVideos)
    .values({
      id: uuid(),
      userId,
      sourceUrl: url,
      platform,
      status: "downloading",
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!created) {
    throw new Error("Video was not created")
  }

  startProcessing(created.id, userId)
  return serializeViralVideo(created)
}

// Re-runs the pipeline; covers failed rows and rows stuck mid-processing
// after a server restart (there is no job queue — processing is in-process).
export async function retryViralVideoForCurrentUser(
  videoId: string
): Promise<ViralVideoItem> {
  requireAppOrigin()
  const user = await requireUser()
  const row = await getOwnedViralVideo(user.id, videoId)
  if (row.status === "ready") {
    throw new Error("Video is already processed")
  }

  const [updated] = await db
    .update(aiVideoViralVideos)
    .set({ status: "downloading", error: null, updatedAt: now() })
    .where(
      and(
        eq(aiVideoViralVideos.id, videoId),
        eq(aiVideoViralVideos.userId, user.id)
      )
    )
    .returning()

  if (!updated) {
    throw new Error("Video not found")
  }

  startProcessing(videoId, user.id)
  return serializeViralVideo(updated)
}

// Removes one owned row plus the downloaded footage and the extracted
// thumbnail (R2 objects + their media rows) — templates/projects built from
// it keep their timing but lose the original media (UI warns before delete).
// Exported for the creator-delete cascade (imported dynamically there to
// avoid a static import cycle with creators.ts).
export async function destroyViralVideo(userId: string, row: AiVideoViralVideo) {
  if (row.mediaId) {
    const [media] = await db
      .select()
      .from(aiVideoMedia)
      .where(
        and(eq(aiVideoMedia.id, row.mediaId), eq(aiVideoMedia.userId, userId))
      )
      .limit(1)
    if (media) {
      await deleteFromR2(media.storagePath)
      await db.delete(aiVideoMedia).where(eq(aiVideoMedia.id, media.id))
    }
  }

  if (row.thumbnailStoragePath) {
    await deleteFromR2(row.thumbnailStoragePath).catch(() => undefined)
    await db
      .delete(aiVideoMedia)
      .where(
        and(
          eq(aiVideoMedia.storagePath, row.thumbnailStoragePath),
          eq(aiVideoMedia.userId, userId)
        )
      )
  }

  await db
    .delete(aiVideoViralVideos)
    .where(
      and(
        eq(aiVideoViralVideos.id, row.id),
        eq(aiVideoViralVideos.userId, userId)
      )
    )
}

export async function deleteViralVideoForCurrentUser(
  videoId: string
): Promise<{ videoId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const row = await getOwnedViralVideo(user.id, videoId)
  await destroyViralVideo(user.id, row)
  return { videoId }
}

export async function deleteViralVideosForCurrentUser(
  videoIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(videoIds))
  const rows = await db
    .select()
    .from(aiVideoViralVideos)
    .where(
      and(
        eq(aiVideoViralVideos.userId, user.id),
        inArray(aiVideoViralVideos.id, uniqueIds)
      )
    )

  for (const row of rows) {
    await destroyViralVideo(user.id, row)
  }
  return { deletedCount: rows.length }
}

// Fire-and-forget kickoff; processViralVideo records failures on the row, so
// this catch only guards against the status write itself failing.
function startProcessing(videoId: string, userId: string) {
  void processViralVideo(videoId, userId).catch((error) => {
    console.error("Viral video processing failed", videoId, error)
  })
}

async function updateViralRow(
  videoId: string,
  userId: string,
  patch: Partial<typeof aiVideoViralVideos.$inferInsert>
) {
  await db
    .update(aiVideoViralVideos)
    .set({ ...patch, updatedAt: now() })
    .where(
      and(
        eq(aiVideoViralVideos.id, videoId),
        eq(aiVideoViralVideos.userId, userId)
      )
    )
}

// The pipeline: download via yt-dlp → ingest the file as a regular media row
// → analyze with Gemini. Each stage writes its progress to the row so the
// dashboard's polling shows downloading → analyzing → ready (or error).
// Retries with footage already ingested skip straight to analysis instead of
// re-downloading (and duplicating the media row).
async function processViralVideo(videoId: string, userId: string) {
  try {
    const row = await getOwnedViralVideo(userId, videoId)

    if (row.mediaId) {
      const [existing] = await db
        .select()
        .from(aiVideoMedia)
        .where(
          and(eq(aiVideoMedia.id, row.mediaId), eq(aiVideoMedia.userId, userId))
        )
        .limit(1)
      if (existing) {
        await updateViralRow(videoId, userId, { status: "analyzing" })
        const object = await getFromR2(existing.storagePath)
        const bytes = await bodyToBytes(object.Body)
        const analysis = await analyzeViralVideo(
          bytes,
          existing.mimeType,
          row.durationMs
        )
        await updateViralRow(videoId, userId, { analysis, status: "ready" })
        return
      }
    }

    const downloaded = await downloadViralVideo(row.sourceUrl)

    // Ingest exactly like an upload: validate, sniff content, store on R2.
    validateMediaFile(downloaded.mimeType, downloaded.bytes.byteLength)
    const fileData = prepareMediaContent(downloaded.mimeType, downloaded.bytes)
    const originalName = cleanOriginalName(
      `${downloaded.metadata.title ?? "viral-video"}.mp4`
    )
    const filename = storedFilename(originalName, downloaded.mimeType)
    const storagePath = `${userId}/${filename}`

    try {
      await uploadToR2(storagePath, fileData, downloaded.mimeType)
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        throw new Error("R2 storage is not configured")
      }
      throw new Error("Storing the downloaded video failed")
    }

    const mediaCreatedAt = now()
    const mediaId = uuid()
    try {
      await db.insert(aiVideoMedia).values({
        id: mediaId,
        userId,
        filename,
        originalName,
        altText: null,
        fileSize: fileData.byteLength,
        mimeType: downloaded.mimeType,
        fileType: "video",
        storagePath,
        createdAt: mediaCreatedAt,
        updatedAt: mediaCreatedAt,
      })
    } catch (error) {
      await deleteFromR2(storagePath).catch(() => undefined)
      throw error
    }

    // Extract a cover frame, upload it, and insert a media row so it appears
    // in the library alongside the video it came from.
    const thumbBytes = await extractVideoThumbnail(fileData, downloaded.mimeType)
    let thumbnailStoragePath: string | null = null
    if (thumbBytes) {
      const thumbPath = `viral-thumbnails/${userId}/${videoId}.jpg`
      const uploaded = await uploadToR2(thumbPath, thumbBytes, "image/jpeg").catch(() => null)
      if (uploaded !== null) {
        thumbnailStoragePath = thumbPath
        // Truncate: titles run up to 500 chars but media name columns are 255.
        const thumbName = `${(downloaded.metadata.title ?? "thumbnail").slice(0, 240)}-cover.jpg`
        const thumbCreatedAt = now()
        await db.insert(aiVideoMedia).values({
          id: uuid(),
          userId,
          filename: thumbName,
          originalName: thumbName,
          altText: null,
          fileSize: thumbBytes.byteLength,
          mimeType: "image/jpeg",
          fileType: "image",
          storagePath: thumbPath,
          createdAt: thumbCreatedAt,
          updatedAt: thumbCreatedAt,
        }).catch(() => undefined)
      }
    }

    // Attach the reel to its creator — handle vs display name is swapped per
    // platform in yt-dlp metadata (see DownloadedViralVideo).
    const platform = row.platform as ViralPlatform
    const creatorId = await upsertCreatorFromReel(userId, platform, {
      handle:
        platform === "instagram"
          ? downloaded.metadata.channelName
          : downloaded.metadata.uploaderName,
      displayName:
        platform === "instagram"
          ? downloaded.metadata.uploaderName
          : downloaded.metadata.channelName,
    })

    await updateViralRow(videoId, userId, {
      mediaId,
      thumbnailStoragePath,
      creatorId,
      title: downloaded.metadata.title,
      author: downloaded.metadata.author,
      durationMs: downloaded.metadata.durationMs,
      stats: {
        views: downloaded.metadata.viewCount,
        likes: downloaded.metadata.likeCount,
        comments: downloaded.metadata.commentCount,
        postedAt: downloaded.metadata.postedAt,
      } satisfies ViralVideoStats,
      status: "analyzing",
    })

    // First engagement snapshot; later re-syncs append more and unlock the
    // trending velocity. Best-effort — never fails the pipeline.
    await db
      .insert(aiVideoViralVideoStats)
      .values({
        id: uuid(),
        videoId,
        capturedAt: now(),
        views: downloaded.metadata.viewCount,
        likes: downloaded.metadata.likeCount,
        comments: downloaded.metadata.commentCount,
      })
      .catch(() => undefined)

    const analysis = await analyzeViralVideo(
      fileData,
      downloaded.mimeType,
      downloaded.metadata.durationMs
    )

    await updateViralRow(videoId, userId, { analysis, status: "ready" })
  } catch (error) {
    // Fail loud: the message lands on the row and shows in the archive UI.
    await updateViralRow(videoId, userId, {
      status: "error",
      error:
        error instanceof Error && error.message
          ? error.message.slice(0, 1000)
          : "Processing failed",
    })
  }
}
