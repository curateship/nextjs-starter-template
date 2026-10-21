import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import { getExportErrorMessage } from "@/lib/api/video/exports"
import { AI_KEY_MISSING_MESSAGES } from "@/lib/video/ai-providers"
import {
  CAROUSEL_CONFLICT_MESSAGE,
  CAROUSEL_EMPTY_EXPORT_MESSAGE,
  CAROUSEL_EXPORT_FAILED_MESSAGE,
  CAROUSEL_FORMATS,
  CAROUSEL_KEEP_FAILED_MESSAGE,
  CAROUSEL_MEDIA_MISSING_MESSAGE,
  CAROUSEL_ITEM_LIMIT_MESSAGE,
  CAROUSEL_NAME_MAX,
  CAROUSEL_NAME_REQUIRED_MESSAGE,
  CAROUSEL_NOT_FOUND_MESSAGE,
  CAROUSEL_ONE_VIDEO_MESSAGE,
  CAROUSEL_VIDEO_FAILED_MESSAGE,
  CAROUSEL_VIDEO_MUSIC_MISSING_MESSAGE,
  CAROUSEL_VIDEO_SECONDS,
  CAROUSEL_VIDEO_TRANSITIONS,
  FIRST_FRAMES_NOT_FOUND_MESSAGE,
  SAVED_CAROUSEL_INVALID_MESSAGE,
  carouselSlidesSchema,
  type CarouselFormat,
  type CarouselGradientShadowItem,
  type CarouselMediaFit,
  type CarouselMediaItem,
  type CarouselShadowDirection,
  type CarouselSlide,
  type CarouselSlideItem,
  type CarouselTextAlign,
  type CarouselTextItem,
} from "@/lib/video/carousel-schema"
import { userGet, userPost } from "@/server/guards"
import { keepCarouselExport } from "@/server/video/carousel-exports"
import { listVideoMedia } from "@/server/video/media-list"
import { makeCarouselVideo } from "@/server/video/carousel-video"
import {
  suggestFirstSlideLines,
  translateCarousel,
  writeCarouselCaption,
  writeCarouselDraft,
  type CarouselSource,
} from "@/server/video/carousel-writer"
import {
  CAROUSEL_NO_WORDS_MESSAGE,
  CAROUSEL_SLIDE_COUNT,
  CAROUSEL_SOURCE_EMPTY_MESSAGE,
  CAROUSEL_WRITER_LABELS,
  FIRST_SLIDE_NO_TEXT_MESSAGE,
  LINK_REFUSED_MESSAGE,
  LINK_UNREADABLE_MESSAGE,
  PROJECT_SCRIPT_EMPTY_MESSAGE,
} from "@/lib/video/carousel-writing"
import { TRANSLATE_LANGUAGES } from "@/lib/video/translate"
import {
  keepCarouselStockPhoto,
  searchCarouselStockPhotos,
} from "@/server/video/carousel-stock"
import {
  STOCK_DOWNLOAD_FAILED_MESSAGE,
  STOCK_NO_KEY_MESSAGE,
} from "@/lib/video/stock-photos"
import type { PexelsPhoto } from "@/server/video/pexels"
import {
  listOwnedCarouselVersions,
  restoreOwnedCarouselVersion,
  type CarouselVersionItem,
} from "@/server/video/carousel-versions"
import {
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
} from "@/lib/video/project-versions"
import {
  createCarouselFromFrames,
  createCarouselFromTemplate,
  listOwnedTemplates,
  listProjectCarousels,
  setCarouselTemplate,
  createOwnedCarousel,
  deleteOwnedCarousels,
  duplicateOwnedCarousel,
  getOwnedCarouselDetail,
  listOwnedCarousels,
  polishOwnedCarouselText,
  renameOwnedCarousel,
  writeCarousel,
  type CarouselDetail,
  type CarouselItem,
  type CarouselListResponse,
} from "@/server/video/carousels"

export type {
  CarouselVersionItem,
  PexelsPhoto,
  CarouselDetail,
  CarouselFormat,
  CarouselGradientShadowItem,
  CarouselItem,
  CarouselListResponse,
  CarouselMediaFit,
  CarouselMediaItem,
  CarouselShadowDirection,
  CarouselSlide,
  CarouselSlideItem,
  CarouselTextAlign,
  CarouselTextItem,
}

const KNOWN_MESSAGES = new Set([
  CAROUSEL_NAME_REQUIRED_MESSAGE,
  CAROUSEL_NOT_FOUND_MESSAGE,
  CAROUSEL_CONFLICT_MESSAGE,
  SAVED_CAROUSEL_INVALID_MESSAGE,
  FIRST_FRAMES_NOT_FOUND_MESSAGE,
  "Project not found",
  "A carousel needs at least one slide.",
  "A carousel can have at most 20 slides.",
  CAROUSEL_ITEM_LIMIT_MESSAGE,
  CAROUSEL_ONE_VIDEO_MESSAGE,
  CAROUSEL_VIDEO_FAILED_MESSAGE,
  CAROUSEL_VIDEO_MUSIC_MISSING_MESSAGE,
  CAROUSEL_MEDIA_MISSING_MESSAGE,
  CAROUSEL_EXPORT_FAILED_MESSAGE,
  CAROUSEL_EMPTY_EXPORT_MESSAGE,
  CAROUSEL_KEEP_FAILED_MESSAGE,
  STOCK_NO_KEY_MESSAGE,
  STOCK_DOWNLOAD_FAILED_MESSAGE,
  CAROUSEL_NO_WORDS_MESSAGE,
  CAROUSEL_SOURCE_EMPTY_MESSAGE,
  FIRST_SLIDE_NO_TEXT_MESSAGE,
  LINK_REFUSED_MESSAGE,
  LINK_UNREADABLE_MESSAGE,
  PROJECT_SCRIPT_EMPTY_MESSAGE,
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
])

// The words ffmpeg's runner uses when it is missing on the server
// (`src/server/video/ffmpeg.ts`), kept here so the browser need not load it.
const FFMPEG_MISSING_TEXT = "ffmpeg is not installed on this server"
const EXPORT_FALLBACK_MESSAGE = "The export could not be made."

export function getCarouselErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message === "Select a text layer first.") return message
  if (message.includes("AI_LIMIT_REACHED")) {
    return "Your monthly AI allowance is used up."
  }
  if (AI_KEY_MISSING_MESSAGES.has(message)) return message
  if (message.startsWith("Carousel text help")) return message
  if (CAROUSEL_WRITER_LABELS.some((label) => message.startsWith(label))) {
    return message
  }
  // Pexels' own refusals: the key, the hour's searches, or the site down.
  if (message.startsWith("Pexels")) return message
  if (message === FFMPEG_MISSING_TEXT) return message
  // A carousel made into a video is queued like any export.
  const exportMessage = getExportErrorMessage(error)
  if (exportMessage !== EXPORT_FALLBACK_MESSAGE) return exportMessage
  return describeAuthError(message) ?? "Carousel request failed."
}

const carouselIdSchema = z.object({
  carouselId: z.string().min(1).max(36),
})
const nameSchema = z.object({
  name: z.string().min(1).max(CAROUSEL_NAME_MAX),
})
const listSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    search: z.string().trim().max(120).default(""),
  })
  .optional()
const saveSchema = carouselIdSchema.extend({
  slides: carouselSlidesSchema,
  format: z.enum(CAROUSEL_FORMATS),
  caption: z.string().max(2_200),
  version: z.number().int().min(1),
})
const deleteSchema = z.object({
  carouselIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})
const textHelpSchema = carouselIdSchema.extend({
  slideId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
})

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .validator(listSchema)
  .handler(({ data, context }) =>
    listOwnedCarousels({
      userId: context.user.id,
      page: data?.page,
      pageSize: data?.pageSize,
      search: data?.search,
    })
  )

const getFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .validator(carouselIdSchema)
  .handler(({ data, context }) =>
    getOwnedCarouselDetail(context.user.id, data.carouselId)
  )

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .validator(nameSchema)
  .handler(({ data, context }) =>
    createOwnedCarousel(context.user.id, data.name)
  )

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .validator(
    carouselIdSchema.extend({ format: z.enum(CAROUSEL_FORMATS).optional() })
  )
  .handler(({ data, context }) =>
    duplicateOwnedCarousel(context.user.id, data.carouselId, data.format)
  )

const renameFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .validator(carouselIdSchema.extend(nameSchema.shape))
  .handler(({ data, context }) =>
    renameOwnedCarousel(context.user.id, data.carouselId, data.name)
  )

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .validator(saveSchema)
  .handler(({ data, context }) =>
    writeCarousel(context.user.id, data.carouselId, {
      slides: data.slides,
      format: data.format,
      caption: data.caption,
      expectedVersion: data.version,
    })
  )

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .validator(deleteSchema)
  .handler(({ data, context }) =>
    deleteOwnedCarousels(context.user.id, data.carouselIds)
  )

const textHelpFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .validator(textHelpSchema)
  .handler(({ data, context }) =>
    polishOwnedCarouselText(
      context.user.id,
      data.carouselId,
      data.slideId,
      data.itemId
    )
  )

export function listCarousels(options?: {
  page?: number
  pageSize?: number
  search?: string
}) {
  return listFn({ data: options })
}

export function getCarousel(carouselId: string) {
  return getFn({ data: { carouselId } })
}

export function createCarousel(name: string) {
  return createFn({ data: { name } })
}

const fromFramesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1).max(36),
      firstFrameIds: z.array(z.string().min(1).max(36)).min(1).max(20),
      format: z.enum(CAROUSEL_FORMATS),
    })
  )
  .handler(async ({ data, context }) =>
    createCarouselFromFrames(
      context.user.id,
      data.projectId,
      data.firstFrameIds,
      data.format
    )
  )

/** A new carousel with one slide per first frame, in the order given. */
export function createCarouselFromFirstFrames(
  projectId: string,
  firstFrameIds: string[],
  format: CarouselFormat
) {
  return fromFramesFn({ data: { projectId, firstFrameIds, format } })
}

/** A copy of a carousel, or, given a shape, a copy moved into that shape. */
export function duplicateCarousel(carouselId: string, format?: CarouselFormat) {
  return duplicateFn({ data: { carouselId, format } })
}

export function renameCarousel(carouselId: string, name: string) {
  return renameFn({ data: { carouselId, name } })
}

export function saveCarousel(
  carouselId: string,
  value: {
    slides: CarouselSlide[]
    format: CarouselFormat
    caption: string
    version: number
  }
) {
  return saveFn({ data: { carouselId, ...value } })
}

export function deleteCarousels(carouselIds: string[]) {
  return deleteFn({ data: { carouselIds } })
}

const exportFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ carouselId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) =>
    keepCarouselExport({ userId: context.user.id, carouselId: data.carouselId })
  )

/**
 * Export the saved carousel: the server draws every slide, zips them with the
 * caption and keeps the ZIP on the Exports page, where it can be downloaded
 * again. The export's own file address hands the ZIP over straight away.
 */
export function exportCarousel(carouselId: string) {
  return exportFn({ data: { carouselId } })
}

export function polishCarouselText(
  carouselId: string,
  slideId: string,
  itemId: string
) {
  return textHelpFn({ data: { carouselId, slideId, itemId } })
}

// The pictures in one of the person's collections, from their whole library
// rather than this carousel's shelf (workspace/docs/media-collections.md).
// Only the caller's own files are listed, so another person's collection id
// lists nothing.
const collectionPicturesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      collectionId: z.string().min(1).max(36),
      search: z.string().trim().max(120).default(""),
    })
  )
  .handler(async ({ data, context }) => {
    const page = await listVideoMedia({
      userId: context.user.id,
      fileType: "image",
      pageSize: 30,
      search: data.search,
      collectionId: data.collectionId,
    })
    return page.media
  })

export function listCollectionPictures(collectionId: string, search = "") {
  return collectionPicturesFn({ data: { collectionId, search } })
}

const stockSearchFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    carouselIdSchema.extend({ query: z.string().trim().min(1).max(100) })
  )
  .handler(({ data, context }) =>
    searchCarouselStockPhotos(context.user.id, data.carouselId, data.query)
  )

const stockKeepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    carouselIdSchema.extend({
      photo: z.object({
        pexelsId: z.number().int(),
        fileUrl: z.string().url().max(2_048),
        pageUrl: z.string().max(2_048),
        photographer: z.string().max(200),
        photographerUrl: z.string().max(2_048),
      }),
    })
  )
  .handler(({ data, context }) =>
    keepCarouselStockPhoto(context.user.id, data.carouselId, data.photo)
  )

/** Free Pexels photos for a search, tall or square to suit the carousel. */
export function searchStockPhotos(carouselId: string, query: string) {
  return stockSearchFn({ data: { carouselId, query } })
}

/** Saves one Pexels photo onto the carousel's shelf, ready to place. */
export function keepStockPhoto(carouselId: string, photo: PexelsPhoto) {
  return stockKeepFn({
    data: {
      carouselId,
      photo: {
        pexelsId: photo.pexelsId,
        fileUrl: photo.fileUrl,
        pageUrl: photo.pageUrl,
        photographer: photo.photographer,
        photographerUrl: photo.photographerUrl,
      },
    },
  })
}

const videoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    carouselIdSchema.extend({
      secondsPerSlide: z
        .number()
        .min(CAROUSEL_VIDEO_SECONDS.min)
        .max(CAROUSEL_VIDEO_SECONDS.max),
      transition: z.enum(CAROUSEL_VIDEO_TRANSITIONS),
      music: z
        .object({
          mediaId: z.string().min(1).max(36),
          // Measured by the browser from the file; it only sets how many
          // times the track repeats under this person's own video.
          sourceDurationMs: z.number().positive().max(4 * 60 * 60_000),
        })
        .optional(),
    })
  )
  .handler(({ data, context }) =>
    makeCarouselVideo({
      userId: context.user.id,
      carouselId: data.carouselId,
      secondsPerSlide: data.secondsPerSlide,
      transition: data.transition,
      music: data.music,
    })
  )

/**
 * Turns the saved carousel into a 9:16 video project and queues its export.
 * The export then shows on the video Exports page.
 */
export function makeVideoFromCarousel(
  carouselId: string,
  options: {
    secondsPerSlide: number
    transition: (typeof CAROUSEL_VIDEO_TRANSITIONS)[number]
    music?: { mediaId: string; sourceDurationMs: number }
  }
) {
  return videoFn({ data: { carouselId, ...options } })
}

const draftFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("topic"), text: z.string().trim().min(1).max(300) }),
        z.object({ kind: z.literal("notes"), text: z.string().trim().min(1).max(20_000) }),
        z.object({ kind: z.literal("project"), projectId: z.string().min(1).max(36) }),
        z.object({ kind: z.literal("link"), url: z.string().trim().url().max(2_048) }),
      ]),
      slideCount: z
        .number()
        .int()
        .min(CAROUSEL_SLIDE_COUNT.min)
        .max(CAROUSEL_SLIDE_COUNT.max),
      format: z.enum(CAROUSEL_FORMATS),
    })
  )
  .handler(({ data, context }) =>
    writeCarouselDraft({ userId: context.user.id, ...data })
  )

const firstSlideFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(carouselIdSchema.extend({ itemId: z.string().min(1).max(64) }))
  .handler(({ data, context }) =>
    suggestFirstSlideLines({ userId: context.user.id, ...data })
  )

const captionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(carouselIdSchema)
  .handler(({ data, context }) =>
    writeCarouselCaption({ userId: context.user.id, carouselId: data.carouselId })
  )

const translateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    carouselIdSchema.extend({
      languages: z.array(z.enum(TRANSLATE_LANGUAGES)).min(1).max(10),
    })
  )
  .handler(async ({ data, context }) => {
    const result = await translateCarousel({ userId: context.user.id, ...data })
    // A failed language says why in words meant for the person, never the
    // raw text of a database or provider error.
    return {
      ...result,
      failed: result.failed.map((item) => ({
        ...item,
        message: getCarouselErrorMessage(new Error(item.message)),
      })),
    }
  })

export type { CarouselSource }

/** A new carousel written by the chosen writer from a topic, notes, a script or a page. */
export function writeCarouselWithAi(
  source: CarouselSource,
  slideCount: number,
  format: CarouselFormat
) {
  return draftFn({ data: { source, slideCount, format } })
}

/** Three other ways to word the first slide's picked text layer. */
export function suggestFirstSlide(carouselId: string, itemId: string) {
  return firstSlideFn({ data: { carouselId, itemId } })
}

/** A post caption written from the saved slides, with no hashtags. */
export function writeCaption(carouselId: string) {
  return captionFn({ data: { carouselId } })
}

/** One translated copy of the saved carousel per language. */
export function translateCarouselCopies(
  carouselId: string,
  languages: (typeof TRANSLATE_LANGUAGES)[number][]
) {
  return translateFn({ data: { carouselId, languages } })
}

const templatesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => listOwnedTemplates(context.user.id))

const markTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(carouselIdSchema.extend({ isTemplate: z.boolean() }))
  .handler(({ data, context }) =>
    setCarouselTemplate(context.user.id, data.carouselId, data.isTemplate)
  )

const fromTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    nameSchema.extend({ templateId: z.string().min(1).max(36) })
  )
  .handler(({ data, context }) =>
    createCarouselFromTemplate(context.user.id, data.templateId, data.name)
  )

const projectCarouselsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(({ data, context }) =>
    listProjectCarousels(context.user.id, data.projectId)
  )

const versionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(carouselIdSchema)
  .handler(
    ({ data, context }): Promise<CarouselVersionItem[]> =>
      listOwnedCarouselVersions(context.user.id, data.carouselId)
  )

const restoreVersionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(carouselIdSchema.extend({ versionId: z.string().min(1).max(36) }))
  .handler(({ data, context }) =>
    restoreOwnedCarouselVersion(context.user.id, data.carouselId, data.versionId)
  )

/** This person's templates, for New carousel. */
export function listCarouselTemplates() {
  return templatesFn()
}

/** Marks a carousel as a template, or takes the mark off. */
export function markCarouselTemplate(carouselId: string, isTemplate: boolean) {
  return markTemplateFn({ data: { carouselId, isTemplate } })
}

/** A new carousel copied from a template. */
export function createFromTemplate(templateId: string, name: string) {
  return fromTemplateFn({ data: { templateId, name } })
}

/** The carousels that belong to a project. */
export function listCarouselsOfProject(projectId: string) {
  return projectCarouselsFn({ data: { projectId } })
}

/** The carousel's kept earlier versions, newest first. */
export function listCarouselVersions(carouselId: string) {
  return versionsFn({ data: { carouselId } })
}

/** Brings a version back; what was there is kept first. */
export function restoreCarouselVersion(carouselId: string, versionId: string) {
  return restoreVersionFn({ data: { carouselId, versionId } })
}
