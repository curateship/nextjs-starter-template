import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getThumbnailErrorMessage } from "@/lib/api/video/thumbnails"
import { ACTOR_IMAGE_MODEL_IDS } from "@/lib/video/asset-factories"
import { PICTURE_EDIT_KINDS, PICTURE_EDIT_WORDS_MAX } from "@/lib/video/picture-edits"
import {
  COPY_STYLE_LINK_MESSAGE,
  IDEAS_NEED_WORDS_MESSAGE,
  type ThumbnailIdea,
} from "@/lib/video/thumbnail-ai"
import { THUMBNAIL_SHAPES } from "@/lib/video/thumbnails"
import { editorPost } from "@/server/video/editor-guards"
import { actorForVideo } from "@/server/video/project-guests"
import {
  actorIntoThumbnail,
  changeBoardPicture,
  checkThumbnail,
  copyStyle,
  ideasFromVideo,
  languageCopiesOf,
  makeIdea,
  titlesForThumbnail,
  translateThumbnail,
} from "@/server/video/thumbnail-ai"
import { actorForThumbnail } from "@/server/video/thumbnails"

/**
 * The AI on the Thumbnail board (thumbnails.md). A guest sent from Project
 * may use all of it, acting as the project's owner and paid from the owner's
 * keys (Tyler, 3 Nov 2026), so every call is checked against the thumbnail
 * or video it names.
 */

const KNOWN_MESSAGES = new Set([IDEAS_NEED_WORDS_MESSAGE, COPY_STYLE_LINK_MESSAGE])

export function getThumbnailAiErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return getThumbnailErrorMessage(error)
}

const thumbnailId = z.string().min(1).max(36)
const videoId = z.string().min(1).max(36)
const model = z.enum(ACTOR_IMAGE_MODEL_IDS)
const tries = z.union([z.literal(1), z.literal(2), z.literal(4)])
const shape = z.enum(THUMBNAIL_SHAPES)

const pictureFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      thumbnailId,
      layerId: z.string().min(1).max(64),
      kind: z.enum(PICTURE_EDIT_KINDS),
      words: z.string().max(PICTURE_EDIT_WORDS_MAX).optional(),
      model,
      tries,
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return changeBoardPicture({ owner: userId, ...data })
  })

const ideasFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ videoId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return ideasFromVideo({ owner: userId, videoId: data.videoId })
  })

const makeIdeaFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      videoId,
      shape,
      model,
      tries,
      idea: z.object({
        atMs: z.number().nonnegative().finite(),
        words: z.string().max(60),
        expression: z.string().max(120),
        background: z.string().max(160),
      }),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return makeIdea({ owner: userId, ...data })
  })

const actorFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      thumbnailId,
      actorId: z.string().min(1).max(36),
      expression: z.string().max(120),
      model,
      tries,
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return actorIntoThumbnail({ owner: userId, ...data })
  })

const titlesFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return titlesForThumbnail(userId, data.thumbnailId)
  })

const checkFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return checkThumbnail(userId, data.thumbnailId)
  })

const copyStyleFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z
      .object({
        videoId,
        shape,
        link: z.string().url().max(500).optional(),
        mediaId: z.string().min(1).max(36).optional(),
      })
      .refine((data) => !!data.link !== !!data.mediaId, "Give a link or a picture.")
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return copyStyle({ owner: userId, ...data })
  })

const languagesFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ videoId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return languageCopiesOf(userId, data.videoId)
  })

const translateFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ thumbnailId, copyVideoId: videoId }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForThumbnail(context.caller, data.thumbnailId)
    return translateThumbnail({ owner: userId, ...data })
  })

type Tries = 1 | 2 | 4
type Model = (typeof ACTOR_IMAGE_MODEL_IDS)[number]

export function changePicture(data: {
  thumbnailId: string
  layerId: string
  kind: (typeof PICTURE_EDIT_KINDS)[number]
  words?: string
  model: Model
  tries: Tries
}) {
  return pictureFn({ data })
}
export function askForIdeas(id: string): Promise<ThumbnailIdea[]> {
  return ideasFn({ data: { videoId: id } })
}
export function makeThumbnailIdea(data: {
  videoId: string
  shape: (typeof THUMBNAIL_SHAPES)[number]
  idea: ThumbnailIdea
  model: Model
  tries: Tries
}) {
  return makeIdeaFn({ data })
}
export function addActorToThumbnail(data: {
  thumbnailId: string
  actorId: string
  expression: string
  model: Model
  tries: Tries
}) {
  return actorFn({ data })
}
export function writeTitles(id: string): Promise<string[]> {
  return titlesFn({ data: { thumbnailId: id } })
}
export function checkThumbnailNow(id: string) {
  return checkFn({ data: { thumbnailId: id } })
}
export function copyThumbnailStyle(data: {
  videoId: string
  shape: (typeof THUMBNAIL_SHAPES)[number]
  link?: string
  mediaId?: string
}) {
  return copyStyleFn({ data })
}
export function listLanguageCopies(id: string) {
  return languagesFn({ data: { videoId: id } })
}
export function translateThumbnailTo(id: string, copyVideoId: string) {
  return translateFn({ data: { thumbnailId: id, copyVideoId } })
}
