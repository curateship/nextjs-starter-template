import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import sharp from "sharp"

import {
  fillSpots,
  fullPictureLayer,
  newTextLayer,
  readThumbnailLayers,
  templateLayers,
  THUMBNAIL_CONFLICT_MESSAGE,
  THUMBNAIL_DRAW_FAILED_MESSAGE,
  THUMBNAIL_NOT_FOUND_MESSAGE,
  THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE,
  type ThumbnailLayer,
  type ThumbnailShape,
} from "@/lib/video/thumbnails"
import { db, type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import {
  deleteFromR2,
  getFromR2,
  getPublicMediaUrl,
  uploadToR2,
} from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { findOwnedImageByUrl } from "@/server/media/library"
import { PICTURE_EDIT_NOT_FOUND_MESSAGE } from "@/lib/video/picture-edits"
import { findWorkspaceIdForRequest } from "@/server/workspaces/for-request"
import { CAROUSEL_MEDIA_MISSING_MESSAGE } from "@/lib/video/carousel-schema"
import { saveGeneratedAsset } from "@/server/video/asset-factories/media"
import { attachMediaToScope } from "@/server/video/media-list"
import {
  actorForVideo,
  type EditorActor,
  type EditorCaller,
} from "@/server/video/project-guests"
import { getOwnedVideo } from "@/server/video/project-videos"
import { renderTimelineFrame } from "@/server/video/render"
import { mediaStillInUse } from "@/server/video/media-in-use"
import {
  videoProjectMedia,
  videoRenderJobs,
  videoThumbnails,
  videoThumbnailTemplates,
  type VideoProjectVideoRow,
} from "@/server/video/schema"
import { renderThumbnailJpeg } from "@/server/video/thumbnail-export"

/**
 * The Thumbnail section's records (thumbnails.md): every thumbnail made for
 * one video, the main one of each shape, and the site's templates.
 *
 * A guest sent from Project acts as the project's owner here, as everywhere
 * in the editor, so their thumbnails and their AI use are the owner's
 * (Tyler, 3 Nov 2026: guests get the whole section, AI included).
 */

export type ThumbnailCheck = {
  marks: { thing: "text" | "face" | "colour"; mark: number; fix: string }[]
  /** The version the check was made on; a later edit makes it out of date. */
  version: number
}

export type ThumbnailRow = {
  id: string
  video_id: string
  shape: ThumbnailShape
  background_color: string
  layers: ThumbnailLayer[]
  is_main: boolean
  picture_url: string | null
  title: string | null
  check: ThumbnailCheck | null
  version: number
  created_at: string
  updated_at: string
}

export type ThumbnailTemplateRow = {
  id: string
  name: string
  shape: ThumbnailShape
  background_color: string
  layers: ThumbnailLayer[]
  mine: boolean
}

type StoredThumbnail = typeof videoThumbnails.$inferSelect

async function serialize(
  row: StoredThumbnail,
  database: CustomShellDb = db
): Promise<ThumbnailRow> {
  let pictureUrl: string | null = null
  if (row.mediaId) {
    const [media] = await database
      .select({ storagePath: customShellMedia.storagePath })
      .from(customShellMedia)
      .where(eq(customShellMedia.id, row.mediaId))
      .limit(1)
    if (media) pictureUrl = await getPublicMediaUrl(media.storagePath)
  }
  return {
    id: row.id,
    video_id: row.videoId,
    shape: row.shape,
    background_color: row.backgroundColor,
    layers: readThumbnailLayers(row.layers),
    is_main: row.isMain,
    picture_url: pictureUrl,
    title: row.title,
    check: (row.check as ThumbnailCheck | null) ?? null,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/**
 * Who a call about one thumbnail acts as. The thumbnail's video is read from
 * the row, never from the request, and then checked the way any call naming
 * a video is.
 */
export async function actorForThumbnail(
  caller: EditorCaller,
  thumbnailId: string,
  database: CustomShellDb = db
): Promise<EditorActor> {
  const [row] = await database
    .select({ videoId: videoThumbnails.videoId })
    .from(videoThumbnails)
    .where(eq(videoThumbnails.id, thumbnailId))
    .limit(1)
  if (!row) throw new Error(THUMBNAIL_NOT_FOUND_MESSAGE)
  return actorForVideo(caller, row.videoId, database)
}

export async function getOwnedThumbnail(
  owner: string,
  thumbnailId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select()
    .from(videoThumbnails)
    .where(and(eq(videoThumbnails.id, thumbnailId), eq(videoThumbnails.userId, owner)))
    .limit(1)
  if (!row) throw new Error(THUMBNAIL_NOT_FOUND_MESSAGE)
  return row
}

function serializeTemplate(
  row: typeof videoThumbnailTemplates.$inferSelect,
  owner: string
): ThumbnailTemplateRow {
  return {
    id: row.id,
    name: row.name,
    shape: row.shape,
    background_color: row.backgroundColor,
    layers: readThumbnailLayers(row.layers),
    mine: row.userId === owner,
  }
}

/** The templates of the site this request is on, newest first. */
async function siteTemplates(owner: string, database: CustomShellDb) {
  const workspaceId = await findWorkspaceIdForRequest(owner, database)
  const rows = await database
    .select()
    .from(videoThumbnailTemplates)
    .where(
      workspaceId
        ? eq(videoThumbnailTemplates.workspaceId, workspaceId)
        : and(isNull(videoThumbnailTemplates.workspaceId), eq(videoThumbnailTemplates.userId, owner))
    )
    .orderBy(desc(videoThumbnailTemplates.createdAt))
  return rows.map((row) => serializeTemplate(row, owner))
}

/** Everything the Thumbnail panel lists for one video. */
export async function listVideoThumbnails(
  owner: string,
  videoId: string,
  database: CustomShellDb = db
) {
  await getOwnedVideo(owner, videoId, database)
  const rows = await database
    .select()
    .from(videoThumbnails)
    .where(and(eq(videoThumbnails.videoId, videoId), eq(videoThumbnails.userId, owner)))
    .orderBy(desc(videoThumbnails.createdAt))
  return {
    thumbnails: await Promise.all(rows.map((row) => serialize(row, database))),
    templates: await siteTemplates(owner, database),
  }
}

/**
 * The frame under the playhead at full size, kept in the library for a
 * picture layer. It is kept whole: the layer crops it to the board, so it
 * can still be slid about.
 */
export async function keepFrameForBoard(
  owner: string,
  video: Pick<VideoProjectVideoRow, "id" | "projectId" | "name" | "timeline">,
  atMs: number,
  database: CustomShellDb = db
) {
  const bytes = await renderTimelineFrame({ userId: owner, timeline: video.timeline, atMs })
  const media = await saveGeneratedAsset({
    userId: owner,
    bytes,
    mimeType: "image/jpeg",
    fileType: "image",
    name: `${video.name.slice(0, 80)} thumbnail frame`,
  })
  await attachMediaToScope(owner, { type: "project", id: video.projectId }, media.id, database)
  return { mediaId: media.id, url: media.url, name: media.originalName }
}

/**
 * A new thumbnail. From a template, its spots take the frame under the
 * playhead. Otherwise it is that frame filling the board with big words over
 * it. `layers` is for a version made by the AI or a copy of another one.
 */
export async function createThumbnail({
  owner,
  videoId,
  shape,
  templateId,
  frameAtMs,
  layers,
  backgroundColor,
  title,
  database = db,
}: {
  owner: string
  videoId: string
  shape: ThumbnailShape
  templateId?: string
  frameAtMs?: number
  layers?: ThumbnailLayer[]
  backgroundColor?: string
  title?: string | null
  database?: CustomShellDb
}): Promise<ThumbnailRow> {
  const video = await getOwnedVideo(owner, videoId, database)
  let design: { layers: ThumbnailLayer[]; backgroundColor: string; shape: ThumbnailShape } = {
    layers: layers ?? [],
    backgroundColor: backgroundColor ?? "#000000",
    shape,
  }
  if (!layers) {
    const frame =
      frameAtMs === undefined
        ? null
        : await keepFrameForBoard(owner, video, frameAtMs, database).catch(
            (error) => {
              console.error("Taking the frame for a thumbnail failed", error)
              return null
            }
          )
    if (templateId) {
      const template = (await siteTemplates(owner, database)).find((one) => one.id === templateId)
      if (!template) throw new Error(THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE)
      design = {
        shape: template.shape,
        backgroundColor: template.background_color,
        layers: fillSpots(template.layers, frame),
      }
    } else {
      const picture = frame ? [fullPictureLayer(frame, 0)] : []
      design.layers = [...picture, newTextLayer(shape, picture)]
    }
  }
  const at = now()
  const [row] = await database
    .insert(videoThumbnails)
    .values({
      id: uuid(),
      userId: owner,
      videoId: video.id,
      shape: design.shape,
      backgroundColor: design.backgroundColor,
      layers: design.layers,
      title: title ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return serialize(row, database)
}

/** One save of the board, refused when another window saved first. */
export async function saveThumbnail({
  owner,
  thumbnailId,
  layers,
  backgroundColor,
  version,
  database = db,
}: {
  owner: string
  thumbnailId: string
  layers: ThumbnailLayer[]
  backgroundColor: string
  version: number
  database?: CustomShellDb
}): Promise<ThumbnailRow> {
  const [row] = await database
    .update(videoThumbnails)
    .set({ layers, backgroundColor, version: version + 1, updatedAt: now() })
    .where(
      and(
        eq(videoThumbnails.id, thumbnailId),
        eq(videoThumbnails.userId, owner),
        eq(videoThumbnails.version, version)
      )
    )
    .returning()
  if (!row) {
    await getOwnedThumbnail(owner, thumbnailId, database)
    throw new Error(THUMBNAIL_CONFLICT_MESSAGE)
  }
  return serialize(row, database)
}

export async function setThumbnailTitle(
  owner: string,
  thumbnailId: string,
  title: string | null,
  database: CustomShellDb = db
) {
  const [row] = await database
    .update(videoThumbnails)
    .set({ title, updatedAt: now() })
    .where(and(eq(videoThumbnails.id, thumbnailId), eq(videoThumbnails.userId, owner)))
    .returning()
  if (!row) throw new Error(THUMBNAIL_NOT_FOUND_MESSAGE)
  return serialize(row, database)
}

export async function saveThumbnailCheck(
  owner: string,
  thumbnailId: string,
  check: ThumbnailCheck,
  database: CustomShellDb = db
) {
  await database
    .update(videoThumbnails)
    .set({ check })
    .where(and(eq(videoThumbnails.id, thumbnailId), eq(videoThumbnails.userId, owner)))
}

/** Draws a thumbnail as YouTube takes it, or says it could not. */
export async function drawThumbnail(owner: string, row: StoredThumbnail) {
  try {
    return await renderThumbnailJpeg(owner, {
      shape: row.shape,
      backgroundColor: row.backgroundColor,
      layers: readThumbnailLayers(row.layers),
    })
  } catch (error) {
    if (error instanceof Error && error.message === CAROUSEL_MEDIA_MISSING_MESSAGE) throw error
    console.error("Drawing a thumbnail failed", error)
    throw new Error(THUMBNAIL_DRAW_FAILED_MESSAGE)
  }
}

/** The download: the JPEG as a data address the browser saves. */
export async function downloadThumbnail(owner: string, thumbnailId: string) {
  const row = await getOwnedThumbnail(owner, thumbnailId)
  const jpeg = await drawThumbnail(owner, row)
  return {
    file_name: `thumbnail-${row.shape === "wide" ? "1280x720" : "1080x1920"}.jpg`,
    data_url: `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`,
    bytes: jpeg.byteLength,
  }
}

/**
 * A main thumbnail's picture in the media library, drawn again. The library
 * row stays the same, so anything using it keeps working, and its file is
 * replaced. A thumbnail that is no longer main is left alone.
 */
export async function refreshMainPicture(
  owner: string,
  thumbnailId: string,
  database: CustomShellDb = db
) {
  const row = await getOwnedThumbnail(owner, thumbnailId, database)
  if (!row.isMain) return serialize(row, database)
  const video = await getOwnedVideo(owner, row.videoId, database)
  const jpeg = await drawThumbnail(owner, row)
  let mediaId = row.mediaId
  if (mediaId) {
    const [media] = await database
      .select({ storagePath: customShellMedia.storagePath })
      .from(customShellMedia)
      .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, owner)))
      .limit(1)
    if (media) {
      const storagePath = `${owner}/${mediaId}-${Date.now()}.jpg`
      await uploadToR2(storagePath, jpeg, "image/jpeg")
      await database
        .update(customShellMedia)
        .set({ storagePath, fileSize: jpeg.byteLength, mimeType: "image/jpeg", updatedAt: now() })
        .where(eq(customShellMedia.id, mediaId))
      await deleteFromR2(media.storagePath).catch(() => undefined)
    } else {
      mediaId = null
    }
  }
  if (!mediaId) {
    const media = await saveGeneratedAsset({
      userId: owner,
      bytes: jpeg,
      mimeType: "image/jpeg",
      fileType: "image",
      name: `${video.name.slice(0, 80)} thumbnail`,
    })
    await attachMediaToScope(owner, { type: "project", id: video.projectId }, media.id, database)
    mediaId = media.id
  }
  const [updated] = await database
    .update(videoThumbnails)
    .set({ mediaId })
    .where(eq(videoThumbnails.id, row.id))
    .returning()
  await coverExports(owner, video.id, row.shape, jpeg, database)
  return serialize(updated, database)
}

/**
 * The main thumbnail as the cover of the video's exports (part 23): a wide
 * one on 16:9 exports, a tall one on 9:16. An export whose cover was set by
 * hand with "Use this moment" keeps it.
 */
async function coverExports(
  owner: string,
  videoId: string,
  shape: ThumbnailShape,
  jpeg: Uint8Array,
  database: CustomShellDb = db
) {
  const aspect = shape === "wide" ? "16:9" : "9:16"
  const exports = await database
    .select({ id: videoRenderJobs.id, thumbnailStoragePath: videoRenderJobs.thumbnailStoragePath })
    .from(videoRenderJobs)
    .where(
      and(
        eq(videoRenderJobs.userId, owner),
        eq(videoRenderJobs.videoId, videoId),
        eq(videoRenderJobs.kind, "video"),
        eq(videoRenderJobs.status, "ready"),
        eq(videoRenderJobs.aspect, aspect),
        eq(videoRenderJobs.coverByHand, false)
      )
    )
  if (!exports.length) return
  // The same small size the export's own cover is kept at.
  const cover = new Uint8Array(
    await sharp(jpeg).resize({ width: 640 }).jpeg({ quality: 85 }).toBuffer()
  )
  for (const row of exports) {
    const coverPath = `video/export-covers/${owner}/${row.id}-${Date.now()}.jpg`
    await uploadToR2(coverPath, cover, "image/jpeg")
    await database
      .update(videoRenderJobs)
      .set({ thumbnailStoragePath: coverPath, updatedAt: now() })
      .where(eq(videoRenderJobs.id, row.id))
    if (row.thumbnailStoragePath && row.thumbnailStoragePath !== coverPath) {
      await deleteFromR2(row.thumbnailStoragePath).catch(() => undefined)
    }
  }
}

/**
 * Stars a thumbnail as its shape's main one, or takes the star off. The
 * other main thumbnail of the same shape loses its star and its library
 * picture, so the library holds one picture per shape.
 */
export async function setMainThumbnail(
  owner: string,
  thumbnailId: string,
  main: boolean,
  database: CustomShellDb = db
) {
  const row = await getOwnedThumbnail(owner, thumbnailId, database)
  const [previous] = await database
    .select({ id: videoThumbnails.id, mediaId: videoThumbnails.mediaId })
    .from(videoThumbnails)
    .where(
      and(
        eq(videoThumbnails.videoId, row.videoId),
        eq(videoThumbnails.shape, row.shape),
        eq(videoThumbnails.isMain, true)
      )
    )
    .limit(1)
  if (!main) {
    if (!row.isMain) return serialize(row, database)
    await database
      .update(videoThumbnails)
      .set({ isMain: false, mediaId: null })
      .where(eq(videoThumbnails.id, row.id))
    if (row.mediaId) await removeLibraryPictures(owner, [row.mediaId], database)
    return serialize(await getOwnedThumbnail(owner, thumbnailId, database), database)
  }
  // The new main one takes over the old one's library picture, so the
  // library keeps one picture per shape and it is drawn again below.
  await database.transaction(async (tx) => {
    if (previous && previous.id !== row.id) {
      await tx
        .update(videoThumbnails)
        .set({ isMain: false, mediaId: null })
        .where(eq(videoThumbnails.id, previous.id))
    }
    await tx
      .update(videoThumbnails)
      .set({ isMain: true, mediaId: previous?.mediaId ?? row.mediaId })
      .where(eq(videoThumbnails.id, row.id))
  })
  return refreshMainPicture(owner, thumbnailId, database)
}

/**
 * Library pictures a main thumbnail kept, and their files. Each comes off the
 * project's shelf first. A picture somebody has since used elsewhere, such
 * as dropped on a timeline or a carousel slide, stays in the library.
 */
async function removeLibraryPictures(owner: string, mediaIds: string[], database: CustomShellDb) {
  await database.delete(videoProjectMedia).where(inArray(videoProjectMedia.mediaId, mediaIds))
  const used = await mediaStillInUse(owner, mediaIds, database)
  const rows = await database
    .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
    .from(customShellMedia)
    .where(and(inArray(customShellMedia.id, mediaIds), eq(customShellMedia.userId, owner)))
  for (const media of rows) {
    if (used.has(media.id)) continue
    await database.delete(customShellMedia).where(eq(customShellMedia.id, media.id))
    await deleteFromR2(media.storagePath).catch(() => undefined)
  }
}

export async function deleteThumbnail(
  owner: string,
  thumbnailId: string,
  database: CustomShellDb = db
) {
  const row = await getOwnedThumbnail(owner, thumbnailId, database)
  await database.delete(videoThumbnails).where(eq(videoThumbnails.id, row.id))
  if (row.mediaId) await removeLibraryPictures(owner, [row.mediaId], database)
}

/** A thumbnail's layout offered to everyone on the site (part 10). */
export async function saveThumbnailTemplate(
  owner: string,
  thumbnailId: string,
  name: string,
  database: CustomShellDb = db
) {
  const row = await getOwnedThumbnail(owner, thumbnailId, database)
  return insertTemplate(
    owner,
    {
      name,
      shape: row.shape,
      backgroundColor: row.backgroundColor,
      layers: templateLayers(readThumbnailLayers(row.layers)),
    },
    database
  )
}

export async function insertTemplate(
  owner: string,
  template: {
    name: string
    shape: ThumbnailShape
    backgroundColor: string
    layers: ThumbnailLayer[]
  },
  database: CustomShellDb = db
) {
  const [created] = await database
    .insert(videoThumbnailTemplates)
    .values({
      id: uuid(),
      workspaceId: await findWorkspaceIdForRequest(owner, database),
      userId: owner,
      name: template.name.trim().slice(0, 120) || "Template",
      shape: template.shape,
      backgroundColor: template.backgroundColor,
      layers: template.layers,
      createdAt: now(),
    })
    .returning()
  return serializeTemplate(created, owner)
}

/** Whoever saved a template, or a site admin, may take it away. */
export async function deleteThumbnailTemplate(
  owner: string,
  templateId: string,
  isAdmin: boolean,
  database: CustomShellDb = db
) {
  const template = (await siteTemplates(owner, database)).find((one) => one.id === templateId)
  if (!template || (!template.mine && !isAdmin)) {
    throw new Error(THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE)
  }
  await database
    .delete(videoThumbnailTemplates)
    .where(
      isAdmin
        ? eq(videoThumbnailTemplates.id, templateId)
        : and(eq(videoThumbnailTemplates.id, templateId), eq(videoThumbnailTemplates.userId, owner))
    )
}

/**
 * A new export's cover, when its video has a main thumbnail of its shape.
 * Called once the export is ready; a failure here leaves the frame cover the
 * export already has and is only written to the log.
 */
export async function coverFromMainThumbnail(
  owner: string,
  videoId: string,
  aspect: string,
  database: CustomShellDb = db
) {
  const shape = aspect === "16:9" ? "wide" : aspect === "9:16" ? "tall" : null
  if (!shape) return
  const [main] = await database
    .select({ storagePath: customShellMedia.storagePath })
    .from(videoThumbnails)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoThumbnails.mediaId))
    .where(
      and(
        eq(videoThumbnails.videoId, videoId),
        eq(videoThumbnails.userId, owner),
        eq(videoThumbnails.shape, shape),
        eq(videoThumbnails.isMain, true)
      )
    )
    .limit(1)
  if (!main) return
  const object = await getFromR2(main.storagePath)
  const bytes = await object.Body?.transformToByteArray()
  if (!bytes?.byteLength) return
  await coverExports(owner, videoId, shape, bytes, database)
}

/**
 * A picture picked in the shared media picker, which hands back its address
 * only, as the library row a layer needs. Only the owner's own pictures are
 * found.
 */
export async function pictureForBoard(owner: string, url: string, database: CustomShellDb = db) {
  const found = await findOwnedImageByUrl(owner, url, database)
  if (!found || found.fileType !== "image") throw new Error(PICTURE_EDIT_NOT_FOUND_MESSAGE)
  const [media] = await database
    .select({ originalName: customShellMedia.originalName })
    .from(customShellMedia)
    .where(eq(customShellMedia.id, found.id))
    .limit(1)
  return {
    mediaId: found.id,
    url: await getPublicMediaUrl(found.storagePath),
    name: media?.originalName ?? "Picture",
  }
}

