import { z } from "zod"

import { TEXT_FONT_IDS } from "@/lib/video/text-fonts"

export const CAROUSEL_FORMATS = ["4:5", "1:1", "9:16"] as const
export const CAROUSEL_NAME_MAX = 200
export const CAROUSEL_ITEM_MAX = 50
export const CAROUSEL_NAME_REQUIRED_MESSAGE = "A carousel needs a name."
export const CAROUSEL_ITEM_LIMIT_MESSAGE = "A slide can have at most 50 layers."
export const CAROUSEL_NOT_FOUND_MESSAGE = "Carousel not found."
export const FIRST_FRAMES_NOT_FOUND_MESSAGE =
  "None of those first frames are in this project any more."
export const CAROUSEL_CONFLICT_MESSAGE =
  "This carousel changed somewhere else. Reload to use the newer version."
export const SAVED_CAROUSEL_INVALID_MESSAGE =
  "The saved slides could not be read. Start a new carousel to keep editing."

// Exporting a carousel: drawing its slides, then keeping the ZIP on the
// Exports page (`src/server/video/carousel-exports.ts`).
export const CAROUSEL_MEDIA_MISSING_MESSAGE =
  "A slide image is no longer in the media library."
export const CAROUSEL_EXPORT_FAILED_MESSAGE = "The slide could not be exported."
export const CAROUSEL_EMPTY_EXPORT_MESSAGE =
  "This carousel has no slides to export."
export const CAROUSEL_KEEP_FAILED_MESSAGE =
  "The carousel could not be kept. Try exporting it again in a minute."

// Video slides and carousels made into videos
// (workspace/docs/carousel-video-slides.md, carousel-video.md).
export const CAROUSEL_VIDEO_FAILED_MESSAGE =
  "A video slide could not be made. Check that its clip still plays, then export again."
export const CAROUSEL_VIDEO_MUSIC_MISSING_MESSAGE =
  "That music track is no longer in your library."
export const CAROUSEL_VIDEO_TRANSITIONS = ["cut", "fade", "slide"] as const
export type CarouselVideoTransition =
  (typeof CAROUSEL_VIDEO_TRANSITIONS)[number]
/** Seconds a slide stays up in a carousel made into a video. */
export const CAROUSEL_VIDEO_SECONDS = { min: 1, max: 15, start: 3 } as const

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
  // A hidden layer is neither drawn nor exported. A locked one stays where it
  // is on the canvas and is picked from the Layers list instead.
  hidden: z.literal(true).optional(),
  locked: z.literal(true).optional(),
}

export const CAROUSEL_TEXT_MARK_STYLES = ["bold", "highlight"] as const
export type CarouselTextMarkStyle = (typeof CAROUSEL_TEXT_MARK_STYLES)[number]

/**
 * Words in a text layer drawn bold or on a coloured box: characters `start`
 * up to `end` of the layer's text (workspace/docs/carousel-text-styles.md).
 */
export const carouselTextMarkSchema = z
  .object({
    start: z.number().int().min(0).max(2_000),
    end: z.number().int().min(1).max(2_000),
    style: z.enum(CAROUSEL_TEXT_MARK_STYLES),
  })
  .strict()
  .refine((mark) => mark.end > mark.start, "A mark needs at least one letter.")

export const CAROUSEL_LINE_HEIGHT_RANGE = { min: 0.8, max: 2.4 } as const
export const CAROUSEL_LETTER_SPACING_RANGE = { min: -0.1, max: 0.5 } as const
export const CAROUSEL_OUTLINE_WIDTH_MAX = 24

// The look shared by the layers that draw words: text and slide numbers.
const wordsLookSchema = {
  fontId: z.enum(TEXT_FONT_IDS),
  fontSize: z.number().min(8).max(220),
  color: colorSchema,
  align: z.enum(["left", "center", "right"]),
  // Times the font size from one line to the next; 1.16 when missing.
  lineHeight: z
    .number()
    .min(CAROUSEL_LINE_HEIGHT_RANGE.min)
    .max(CAROUSEL_LINE_HEIGHT_RANGE.max)
    .optional(),
  // Extra room after each letter, as a share of the font size.
  letterSpacing: z
    .number()
    .min(CAROUSEL_LETTER_SPACING_RANGE.min)
    .max(CAROUSEL_LETTER_SPACING_RANGE.max)
    .optional(),
  // A coloured box filling the layer behind its words.
  boxColor: colorSchema.optional(),
  // A line round every letter, in pixels at full size.
  outlineColor: colorSchema.optional(),
  outlineWidth: z.number().min(0).max(CAROUSEL_OUTLINE_WIDTH_MAX).optional(),
}

export const carouselTextItemSchema = z
  .object({
    ...itemBoxSchema,
    ...wordsLookSchema,
    type: z.literal("text"),
    text: z.string().max(2_000),
    marks: z.array(carouselTextMarkSchema).max(200).optional(),
    // The box behind highlighted words; yellow when missing.
    highlightColor: colorSchema.optional(),
  })
  .strict()

/** "3/7": this slide's place and how many slides there are, kept up to date. */
export const carouselSlideNumberItemSchema = z
  .object({
    ...itemBoxSchema,
    ...wordsLookSchema,
    type: z.literal("slide-number"),
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
    // Which part of a cropped picture shows: 0 is its left or top edge, 1 its
    // right or bottom. The middle, 0.5, when missing.
    focusX: z.number().min(0).max(1).optional(),
    focusY: z.number().min(0).max(1).optional(),
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
  carouselSlideNumberItemSchema,
  carouselMediaItemSchema,
  carouselGradientShadowItemSchema,
])

export const CAROUSEL_ONE_VIDEO_MESSAGE = "A slide can hold one video."

export const carouselSlideSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(120),
    backgroundColor: colorSchema,
    items: z
      .array(carouselSlideItemSchema)
      .max(CAROUSEL_ITEM_MAX, CAROUSEL_ITEM_LIMIT_MESSAGE)
      // An exported video slide is one clip with the other layers drawn over
      // it (workspace/docs/carousel-video-slides.md).
      .refine(
        (items) => items.filter((item) => item.type === "video").length <= 1,
        CAROUSEL_ONE_VIDEO_MESSAGE
      ),
  })
  .strict()

export const carouselSlidesSchema = z
  .array(carouselSlideSchema)
  .min(1, "A carousel needs at least one slide.")
  .max(20, "A carousel can have at most 20 slides.")

export const carouselFormatSchema = z.enum(CAROUSEL_FORMATS)

export type CarouselTextItem = z.infer<typeof carouselTextItemSchema>
export type CarouselTextMark = z.infer<typeof carouselTextMarkSchema>
export type CarouselSlideNumberItem = z.infer<
  typeof carouselSlideNumberItemSchema
>
/** A layer that draws words: a text layer or a slide number. */
export type CarouselWordsItem = CarouselTextItem | CarouselSlideNumberItem
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
