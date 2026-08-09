import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import {
  CAROUSEL_CONFLICT_MESSAGE,
  CAROUSEL_FORMATS,
  CAROUSEL_ITEM_LIMIT_MESSAGE,
  CAROUSEL_NAME_MAX,
  CAROUSEL_NAME_REQUIRED_MESSAGE,
  CAROUSEL_NOT_FOUND_MESSAGE,
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
import {
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
  "A carousel needs at least one slide.",
  "A carousel can have at most 20 slides.",
  CAROUSEL_ITEM_LIMIT_MESSAGE,
])

export function getCarouselErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message === "Select a text layer first.") return message
  if (message.includes("AI_LIMIT_REACHED")) {
    return "Your monthly AI allowance is used up."
  }
  if (message.includes("No Google Gemini key is saved")) return message
  if (message.startsWith("Carousel text help")) return message
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
  .validator(carouselIdSchema)
  .handler(({ data, context }) =>
    duplicateOwnedCarousel(context.user.id, data.carouselId)
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

export function duplicateCarousel(carouselId: string) {
  return duplicateFn({ data: { carouselId } })
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

export function polishCarouselText(
  carouselId: string,
  slideId: string,
  itemId: string
) {
  return textHelpFn({ data: { carouselId, slideId, itemId } })
}
