import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CAROUSEL_FORMATS,
  carouselSlideSchema,
  carouselSlidesSchema,
} from "@/lib/carousel-schema"
import type {
  CarouselDetail,
  CarouselFormat,
  CarouselItem,
  CarouselListResponse,
  CarouselSlide,
  CarouselSortBy,
  CarouselSortDirection,
} from "@/server/carousels"

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
export { carouselSlideSchema }

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

const carouselSaveSchema = carouselIdSchema.extend({
  caption: z.string().max(2200),
  format: z.enum(CAROUSEL_FORMATS).optional(),
  slides: carouselSlidesSchema,
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
  "Saved carousel slides are invalid. Recreate the carousel with the current builder.",
  "Saved carousel format is invalid. Recreate the carousel with the current builder.",
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
