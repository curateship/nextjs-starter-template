import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  CarouselDetail,
  CarouselFormat,
  CarouselItem,
  CarouselListResponse,
  CarouselSlide,
  CarouselSortBy,
  CarouselSortDirection,
} from "@/server/carousels"
import { CAROUSEL_FORMATS } from "@/server/carousels"

export type {
  CarouselDetail,
  CarouselFormat,
  CarouselGradientShadowItem,
  CarouselItem,
  CarouselListResponse,
  CarouselMediaFit,
  CarouselMediaItem,
  CarouselSlide,
  CarouselSlideItem,
  CarouselSortBy,
  CarouselSortDirection,
  CarouselTextAlign,
  CarouselTextItem,
} from "@/server/carousels"

const carouselIdSchema = z.object({
  carouselId: z.string().min(1).max(36),
})

const carouselNameSchema = z.string().min(1).max(255)
const carouselSortBySchema = z.enum([
  "name",
  "slide_count",
  "format",
  "updated_at",
])
const carouselSortDirectionSchema = z.enum(["asc", "desc"])

const listCarouselsSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    search: z.string().max(255).optional(),
    sortBy: carouselSortBySchema.optional(),
    sortDirection: carouselSortDirectionSchema.optional(),
  })
  .optional()

const carouselTextItemSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("text"),
  text: z.string().max(2000),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
  zIndex: z.number().int().min(0).max(999),
  fontSize: z.number().min(8).max(220),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  align: z.enum(["left", "center", "right"]),
})

const carouselMediaItemSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["image", "video"]),
  mediaId: z.string().max(36).optional(),
  url: z.string().min(1).max(2048),
  altText: z.string().max(500).optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
  zIndex: z.number().int().min(0).max(999),
  fit: z.enum(["fill", "cover", "contain"]),
})

const carouselGradientShadowItemSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("gradient-shadow"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
  zIndex: z.number().int().min(0).max(999),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  opacity: z.number().min(0).max(100),
})

export const carouselSlideSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(120),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  items: z
    .array(
      z.discriminatedUnion("type", [
        carouselTextItemSchema,
        carouselMediaItemSchema,
        carouselGradientShadowItemSchema,
      ])
    )
    .max(50),
})

const carouselSaveSchema = carouselIdSchema.extend({
  caption: z.string().max(2200),
  format: z.enum(CAROUSEL_FORMATS).optional(),
  slides: z.array(carouselSlideSchema).min(1).max(20),
})

const safeCarouselErrors = new Set([
  "API usage limit reached. Try again next month.",
  "Carousel name is required",
  "Carousel not found",
  "Carousel needs at least one slide",
  "Carousel generation is not configured",
  "Carousel generation returned no result",
  "Carousel generation returned invalid JSON",
  "Carousel generation returned an unexpected shape",
])

export function getCarouselErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Carousel request failed."
  if (safeCarouselErrors.has(error.message)) return error.message
  if (error.message.startsWith("Carousel generation failed")) {
    return error.message
  }
  return "Carousel request failed."
}

const listCarouselsFn = createServerFn({ method: "GET" })
  .inputValidator(listCarouselsSchema)
  .handler(async ({ data }): Promise<CarouselListResponse> => {
    const { listCarouselsForCurrentUser } = await import("@/server/carousels")
    return listCarouselsForCurrentUser({
      page: data?.page,
      pageSize: data?.pageSize,
      search: data?.search,
      sortBy: data?.sortBy as CarouselSortBy | undefined,
      sortDirection: data?.sortDirection as CarouselSortDirection | undefined,
    })
  })

const getCarouselFn = createServerFn({ method: "GET" })
  .inputValidator(carouselIdSchema)
  .handler(async ({ data }): Promise<CarouselDetail> => {
    const { getCarouselForCurrentUser } = await import("@/server/carousels")
    return getCarouselForCurrentUser(data.carouselId)
  })

const createCarouselFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: carouselNameSchema,
      sourceText: z.string().max(20_000),
    })
  )
  .handler(async ({ data }): Promise<CarouselDetail> => {
    const { createCarouselForCurrentUser } = await import("@/server/carousels")
    return createCarouselForCurrentUser(data)
  })

const renameCarouselFn = createServerFn({ method: "POST" })
  .inputValidator(carouselIdSchema.extend({ name: carouselNameSchema }))
  .handler(async ({ data }): Promise<CarouselItem> => {
    const { renameCarouselForCurrentUser } = await import("@/server/carousels")
    return renameCarouselForCurrentUser(data.carouselId, data.name)
  })

const saveCarouselFn = createServerFn({ method: "POST" })
  .inputValidator(carouselSaveSchema)
  .handler(async ({ data }): Promise<CarouselItem> => {
    const { saveCarouselForCurrentUser } = await import("@/server/carousels")
    return saveCarouselForCurrentUser(data.carouselId, {
      caption: data.caption,
      format: data.format as CarouselFormat | undefined,
      slides: data.slides as CarouselSlide[],
    })
  })

const deleteCarouselFn = createServerFn({ method: "POST" })
  .inputValidator(carouselIdSchema)
  .handler(async ({ data }): Promise<{ carouselId: string }> => {
    const { deleteCarouselForCurrentUser } = await import("@/server/carousels")
    return deleteCarouselForCurrentUser(data.carouselId)
  })

const bulkDeleteCarouselsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      carouselIds: z.array(z.string().min(1).max(36)).min(1).max(100),
    })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteCarouselsForCurrentUser } = await import("@/server/carousels")
    return deleteCarouselsForCurrentUser(data.carouselIds)
  })

export function listCarousels(options?: {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: CarouselSortBy
  sortDirection?: CarouselSortDirection
}) {
  return listCarouselsFn({ data: options })
}

export function getCarousel(carouselId: string) {
  return getCarouselFn({ data: { carouselId } })
}

export function createCarousel(name: string, sourceText: string) {
  return createCarouselFn({ data: { name, sourceText } })
}

export function renameCarousel(carouselId: string, name: string) {
  return renameCarouselFn({ data: { carouselId, name } })
}

export function saveCarousel(
  carouselId: string,
  data: {
    caption: string
    slides: CarouselSlide[]
    format?: CarouselFormat
  }
) {
  return saveCarouselFn({ data: { carouselId, ...data } })
}

export function deleteCarousel(carouselId: string) {
  return deleteCarouselFn({ data: { carouselId } })
}

export function bulkDeleteCarousels(carouselIds: string[]) {
  return bulkDeleteCarouselsFn({ data: { carouselIds } })
}
