import { z } from "zod"

import { TEXT_FONT_IDS } from "./text-fonts.ts"

export const CAROUSEL_FORMATS = ["4:5", "1:1", "9:16"] as const
export type CarouselFormat = (typeof CAROUSEL_FORMATS)[number]
export type CarouselItemType = "text" | "image" | "video" | "gradient-shadow"
export type CarouselTextAlign = "left" | "center" | "right"
export type CarouselMediaFit = "fill" | "cover" | "contain"

// Direction a gradient-shadow (scrim) fades in. `up` = today's bottom→top
// behaviour and is the default when the field is absent, so existing saved
// slides stay valid. `solid` is a flat tint, `radial` a centre-out vignette.
export const CAROUSEL_SHADOW_DIRECTIONS = [
  "up",
  "down",
  "left",
  "right",
  "radial",
  "solid",
] as const
export type CarouselShadowDirection =
  (typeof CAROUSEL_SHADOW_DIRECTIONS)[number]
export type CarouselSortBy = "name" | "slide_count" | "format" | "updated_at"
export type CarouselSortDirection = "asc" | "desc"

const safeColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

const carouselItemBaseSchema = {
  id: z.string().min(1).max(64),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
  zIndex: z.number().int().min(0).max(999),
}

export const carouselTextItemSchema = z
  .object({
    ...carouselItemBaseSchema,
    type: z.literal("text"),
    text: z.string().max(2000),
    fontId: z.enum(TEXT_FONT_IDS),
    fontSize: z.number().min(8).max(220),
    color: safeColorSchema,
    align: z.enum(["left", "center", "right"]),
  })
  .strict()

export const carouselMediaItemSchema = z
  .object({
    ...carouselItemBaseSchema,
    type: z.enum(["image", "video"]),
    mediaId: z.string().max(36).optional(),
    url: z.string().min(1).max(2048),
    altText: z.string().max(500).optional(),
    fit: z.enum(["fill", "cover", "contain"]),
  })
  .strict()

export const carouselGradientShadowItemSchema = z
  .object({
    ...carouselItemBaseSchema,
    type: z.literal("gradient-shadow"),
    color: safeColorSchema,
    opacity: z.number().min(0).max(100),
    direction: z.enum(CAROUSEL_SHADOW_DIRECTIONS).optional(),
  })
  .strict()

export const carouselSlideItemSchema = z.discriminatedUnion("type", [
  carouselTextItemSchema,
  carouselMediaItemSchema,
  carouselGradientShadowItemSchema,
])

export const carouselSlideSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(120),
    backgroundColor: safeColorSchema,
    items: z.array(carouselSlideItemSchema).max(50),
  })
  .strict()

export const carouselSlidesSchema = z.array(carouselSlideSchema).min(1).max(20)
export const carouselFormatSchema = z.enum(CAROUSEL_FORMATS)

export type CarouselSlideItem = z.infer<typeof carouselSlideItemSchema>
export type CarouselTextItem = z.infer<typeof carouselTextItemSchema>
export type CarouselMediaItem = z.infer<typeof carouselMediaItemSchema>
export type CarouselGradientShadowItem = z.infer<
  typeof carouselGradientShadowItemSchema
>
export type CarouselSlide = z.infer<typeof carouselSlideSchema>

export function requireCanonicalCarouselSlides(
  value: unknown
): CarouselSlide[] {
  const parsed = carouselSlidesSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      "Saved carousel slides are invalid. Recreate the carousel with the current builder."
    )
  }
  return parsed.data
}

export function requireCanonicalCarouselFormat(value: unknown): CarouselFormat {
  const parsed = carouselFormatSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      "Saved carousel format is invalid. Recreate the carousel with the current builder."
    )
  }
  return parsed.data
}
