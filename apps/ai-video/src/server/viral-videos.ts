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
  aiVideoCreators,
  aiVideoMedia,
  aiVideoViralVideos,
  type AiVideoCreator,
  type AiVideoViralVideo,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
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
  // Author chip shown on the gallery card (joined from the creators table).
  creator: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
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
  creator: AiVideoCreator | null = null
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
    creator: creator
      ? {
          username: creator.username,
          display_name: creator.displayName,
          avatar_url: creator.avatarStoragePath
            ? getPublicMediaUrl(creator.avatarStoragePath)
            : null,
        }
      : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listViralVideosForCurrentUser(): Promise<ViralVideoListResponse> {
  const user = await requireUser()
  // Left-join the creator so each card can show the author chip (avatar +
  // name + handle); videos without a matched creator just omit it.
  const rows = await db
    .select({ video: aiVideoViralVideos, creator: aiVideoCreators })
    .from(aiVideoViralVideos)
    .leftJoin(
      aiVideoCreators,
      eq(aiVideoCreators.id, aiVideoViralVideos.creatorId)
    )
    .where(eq(aiVideoViralVideos.userId, user.id))
    .orderBy(desc(aiVideoViralVideos.createdAt))

  return {
    videos: rows.map(({ video, creator }) =>
      serializeViralVideo(video, creator)
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
