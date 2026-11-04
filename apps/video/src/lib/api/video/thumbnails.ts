import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import { CAROUSEL_MEDIA_MISSING_MESSAGE } from "@/lib/video/carousel-schema"
import { PICTURE_EDIT_NOT_FOUND_MESSAGE } from "@/lib/video/picture-edits"
import { FRAME_FAILED_MESSAGE } from "@/lib/video/saved-frames"
import {
  TEMPLATE_NAME_MAX,
  THUMBNAIL_CONFLICT_MESSAGE,
  THUMBNAIL_DRAW_FAILED_MESSAGE,
  THUMBNAIL_NOT_FOUND_MESSAGE,
  THUMBNAIL_SHAPES,
  THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE,
  THUMBNAIL_TITLE_MAX,
  thumbnailLayersSchema,
} from "@/lib/video/thumbnails"
import { isAdmin } from "@/server/auth/security"
import { editorGet, editorPost } from "@/server/video/editor-guards"
import { actorForVideo } from "@/server/video/project-guests"
import { getOwnedVideo } from "@/server/video/project-videos"
import {
  actorForThumbnail,
  createThumbnail,
  deleteThumbnail,
  deleteThumbnailTemplate,
  downloadThumbnail,
  keepFrameForBoard,
  listVideoThumbnails,
  pictureForBoard,
  refreshMainPicture,
  saveThumbnail,
  saveThumbnailTemplate,
  setMainThumbnail,
  setThumbnailTitle,
  type ThumbnailRow,
  type ThumbnailTemplateRow,
} from "@/server/video/thumbnails"

export type { ThumbnailRow, ThumbnailTemplateRow }

/**
 * The Thumbnail section's records (thumbnails.md). A guest sent from Project
 * may use all of it (Tyler, 3 Nov 2026), acting as the project's owner, so
 * every call is checked against the video or thumbnail it names.
 */

const KNOWN_MESSAGES = new Set([
  PICTURE_EDIT_NOT_FOUND_MESSAGE,
  THUMBNAIL_NOT_FOUND_MESSAGE,
  THUMBNAIL_CONFLICT_MESSAGE,
  THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE,
  CAROUSEL_MEDIA_MISSING_MESSAGE,
  FRAME_FAILED_MESSAGE,
])

export function getThumbnailErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message === THUMBNAIL_DRAW_FAILED_MESSAGE) return `${message}. Try again.`
  return getAiToolErrorMessage(error)
}

const videoId = z.string().min(1).max(36)
const thumbnailId = z.string().min(1).max(36)
const color = z.string().regex(/^#[0-9a-f]{6}$/i)
const shape = z.enum(THUMBNAIL_SHAPES)

const listFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ videoId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return listVideoThumbnails(userId, data.videoId)
  })

const createFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      videoId,
      shape,
      templateId: z.string().min(1).max(36).optional(),
      frameAtMs: z.number().nonnegative().finite().optional(),
      layers: thumbnailLayersSchema.optional(),
      backgroundColor: color.optional(),
      title: z.string().max(THUMBNAIL_TITLE_MAX).nullable().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return createThumbnail({ owner: userId, ...data })
  })

const saveFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      thumbnailId,
      layers: thumbnailLayersSchema,
      backgroundColor: color,
      version: z.number().int().min(1),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return saveThumbnail({ owner: userId, ...data })
  })

const setMainFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId, main: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return setMainThumbnail(userId, data.thumbnailId, data.main)
  })

const refreshMainFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return refreshMainPicture(userId, data.thumbnailId)
  })

const deleteFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    await deleteThumbnail(userId, data.thumbnailId)
    return { ok: true as const }
  })

const downloadFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return downloadThumbnail(userId, data.thumbnailId)
  })

const setTitleFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({ thumbnailId, title: z.string().max(THUMBNAIL_TITLE_MAX).nullable() })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return setThumbnailTitle(userId, data.thumbnailId, data.title?.trim() || null)
  })

const saveTemplateFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId, name: z.string().min(1).max(TEMPLATE_NAME_MAX) }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return saveThumbnailTemplate(userId, data.thumbnailId, data.name)
  })

const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ videoId, templateId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    const { userId, guest } = await actorForVideo(context.caller, data.videoId)
    await deleteThumbnailTemplate(
      userId,
      data.templateId,
      !guest && !!context.caller.user && isAdmin(context.caller.user)
    )
    return { ok: true as const }
  })

const frameFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ videoId, atMs: z.number().nonnegative().finite() }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    const video = await getOwnedVideo(userId, data.videoId)
    return keepFrameForBoard(userId, video, data.atMs).catch((error) => {
      console.error("Taking a frame for the board failed", error)
      throw new Error(FRAME_FAILED_MESSAGE)
    })
  })

const pictureFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ videoId, url: z.string().min(1).max(2_048) }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return pictureForBoard(userId, data.url)
  })

export function listThumbnails(id: string) {
  return listFn({ data: { videoId: id } })
}
export function newThumbnail(data: Parameters<typeof createFn>[0]["data"]): Promise<ThumbnailRow> {
  return createFn({ data })
}
export function saveThumbnailDesign(data: Parameters<typeof saveFn>[0]["data"]): Promise<ThumbnailRow> {
  return saveFn({ data })
}
export function starThumbnail(id: string, main: boolean): Promise<ThumbnailRow> {
  return setMainFn({ data: { thumbnailId: id, main } })
}
export function redrawMainThumbnail(id: string): Promise<ThumbnailRow> {
  return refreshMainFn({ data: { thumbnailId: id } })
}
export function removeThumbnail(id: string) {
  return deleteFn({ data: { thumbnailId: id } })
}
export function downloadThumbnailJpeg(id: string) {
  return downloadFn({ data: { thumbnailId: id } })
}
export function pickThumbnailTitle(id: string, title: string | null): Promise<ThumbnailRow> {
  return setTitleFn({ data: { thumbnailId: id, title } })
}
export function saveAsTemplate(id: string, name: string): Promise<ThumbnailTemplateRow> {
  return saveTemplateFn({ data: { thumbnailId: id, name } })
}
export function removeTemplate(id: string, templateId: string) {
  return deleteTemplateFn({ data: { videoId: id, templateId } })
}
export function pictureFromLibrary(id: string, url: string) {
  return pictureFn({ data: { videoId: id, url } })
}
export function frameForBoard(id: string, atMs: number) {
  return frameFn({ data: { videoId: id, atMs } })
}
