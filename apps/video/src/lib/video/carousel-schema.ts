import { z } from "zod"

import { TEXT_FONT_IDS } from "@/lib/video/text-fonts"

export const CAROUSEL_FORMATS = ["4:5", "1:1", "9:16"] as const
export const CAROUSEL_NAME_MAX = 200
export const CAROUSEL_ITEM_MAX = 50
export const CAROUSEL_NAME_REQUIRED_MESSAGE = "A carousel needs a name."
export const CAROUSEL_ITEM_LIMIT_MESSAGE = "A slide can have at most 50 layers."
export const CAROUSEL_NOT_FOUND_MESSAGE = "Carousel not found."
export const CAROUSEL_CONFLICT_MESSAGE =
  "This carousel changed somewhere else. Reload to use the newer version."
export const SAVED_CAROUSEL_INVALID_MESSAGE =
  "The saved slides could not be read. Start a new carousel to keep editing."

export type CarouselFormat = (typeof CAROUSEL_FORMATS)[number]
export type CarouselTextAlign = "left" | "center" | "right"
export type CarouselMediaFit = "fill" | "cover" | "contain"

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

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)
const itemBoxSchema = {
  id: z.string().min(1).max(64),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
  zIndex: z.number().int().min(0).max(999),
}

export const carouselTextItemSchema = z
  .object({
    ...itemBoxSchema,
    type: z.literal("text"),
    text: z.string().max(2_000),
    fontId: z.enum(TEXT_FONT_IDS),
    fontSize: z.number().min(8).max(220),
    color: colorSchema,
    align: z.enum(["left", "center", "right"]),
  })
  .strict()

export const carouselMediaItemSchema = z
  .object({
    ...itemBoxSchema,
    type: z.enum(["image", "video"]),
    mediaId: z.string().min(1).max(36),
    url: z.string().min(1).max(2_048),
    altText: z.string().max(500).optional(),
    fit: z.enum(["fill", "cover", "contain"]),
  })
  .strict()

export const carouselGradientShadowItemSchema = z
  .object({
    ...itemBoxSchema,
    type: z.literal("gradient-shadow"),
    color: colorSchema,
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
    backgroundColor: colorSchema,
    items: z
      .array(carouselSlideItemSchema)
      .max(CAROUSEL_ITEM_MAX, CAROUSEL_ITEM_LIMIT_MESSAGE),
  })
  .strict()

export const carouselSlidesSchema = z
  .array(carouselSlideSchema)
  .min(1, "A carousel needs at least one slide.")
  .max(20, "A carousel can have at most 20 slides.")

export const carouselFormatSchema = z.enum(CAROUSEL_FORMATS)

export type CarouselTextItem = z.infer<typeof carouselTextItemSchema>
export type CarouselMediaItem = z.infer<typeof carouselMediaItemSchema>
export type CarouselGradientShadowItem = z.infer<
  typeof carouselGradientShadowItemSchema
>
export type CarouselSlideItem = z.infer<typeof carouselSlideItemSchema>
export type CarouselSlide = z.infer<typeof carouselSlideSchema>

export function requireCanonicalCarouselSlides(value: unknown) {
  const parsed = carouselSlidesSchema.safeParse(value)
  if (!parsed.success) throw new Error(SAVED_CAROUSEL_INVALID_MESSAGE)
  return parsed.data
}

export function requireCarouselFormat(value: unknown): CarouselFormat {
  const parsed = carouselFormatSchema.safeParse(value)
  if (!parsed.success) throw new Error(SAVED_CAROUSEL_INVALID_MESSAGE)
  return parsed.data
}
