import { z } from "zod"

import {
  carouselGradientShadowItemSchema,
  carouselMediaItemSchema,
  carouselTextItemSchema,
  type CarouselSlideItem,
} from "@/lib/video/carousel-schema"
import { colourMatrix, type ClipColour } from "@/lib/video/clip-colour"
import {
  MAX_CLIP_BRIGHTNESS,
  MAX_CLIP_CONTRAST,
  MAX_CLIP_SATURATION,
  MIN_CLIP_BRIGHTNESS,
  MIN_CLIP_CONTRAST,
  MIN_CLIP_SATURATION,
} from "@/lib/video/clip-colour"
import { MAX_SHAPE_LINE_WIDTH, MIN_SHAPE_LINE_WIDTH } from "@/lib/video/shapes"

/**
 * The Thumbnail section's board (thumbnails.md): one picture made of layers,
 * 1280 by 720 for YouTube or 1080 by 1920 for a Shorts, TikTok or Reels cover.
 *
 * The layers are the carousel's own (text, pictures and shadows, drawn by the
 * same code on screen and in the download), plus the board's own kinds:
 * arrows and circles, and an empty spot a template leaves where a picture
 * goes. A few looks only the board has ride on the carousel layers: a drop
 * shadow on words, and an outline, a glow and colour sliders on a picture.
 * Both ends draw those from `layerEffectFilter`, one SVG filter.
 */

export const THUMBNAIL_SHAPES = ["wide", "tall"] as const
export type ThumbnailShape = (typeof THUMBNAIL_SHAPES)[number]

export const THUMBNAIL_SIZES: Record<ThumbnailShape, { width: number; height: number }> = {
  wide: { width: 1280, height: 720 },
  tall: { width: 1080, height: 1920 },
}

export const THUMBNAIL_SHAPE_LABELS: Record<ThumbnailShape, string> = {
  wide: "YouTube, 1280 × 720",
  tall: "Shorts cover, 1080 × 1920",
}

/** YouTube refuses a custom thumbnail over 2MB. */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024
export const THUMBNAIL_LAYER_MAX = 50
export const THUMBNAIL_TITLE_MAX = 200
export const TEMPLATE_NAME_MAX = 120

export const THUMBNAIL_NOT_FOUND_MESSAGE = "That thumbnail is no longer here."
export const THUMBNAIL_CONFLICT_MESSAGE =
  "This thumbnail changed somewhere else. Reload to use the newer version."
export const THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE = "That template is no longer offered."
export const THUMBNAIL_DRAW_FAILED_MESSAGE = "The thumbnail could not be drawn"
export const THUMBNAIL_NO_PICTURE_MESSAGE = "Pick a picture layer first."

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

const boxSchema = {
  // Letters, numbers, dashes and underscores only: the id goes into the
  // filter markup the board draws, and a template carries its layers to
  // everyone on the site, so a quote or a bracket in one could run as code
  // in somebody else's browser.
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
  width: z.number().min(0.02).max(3),
  height: z.number().min(0.02).max(3),
  zIndex: z.number().int().min(0).max(999),
  hidden: z.literal(true).optional(),
  locked: z.literal(true).optional(),
}

export const OUTLINE_WIDTH_MAX = 40

/**
 * A drop shadow's settings, each in full-size pixels where it is a distance.
 * A shadow saved before they could be changed has none of them, and draws
 * with these: soft black, 6 pixels straight down (Tyler, 26 Nov 2026: "the
 * drop shadow has no options to adjust the shadow parameters").
 */
export const TEXT_SHADOW_DEFAULTS = { color: "#000000", opacity: 0.75, blur: 8, x: 0, y: 6, spread: 0 } as const
export const SHADOW_BLUR_MAX = 40
export const SHADOW_OFFSET_MAX = 40
/** How far a shadow can grow out on every side (Tyler, 26 Nov 2026: "expand the shadows evenly and darker"). */
export const SHADOW_SPREAD_MAX = 30
/**
 * Strength past 1 fills in a soft shadow's faded edges, so the shadow gets
 * denser and darker; at 1 its middle is already fully the shadow's colour.
 */
export const SHADOW_STRENGTH_MAX = 3

/** A text layer: the carousel's, with a drop shadow it may have. */
const thumbnailTextSchema = carouselTextItemSchema
  .extend({
    ...boxSchema,
    shadow: z.literal(true).optional(),
    shadowColor: colorSchema.optional(),
    shadowOpacity: z.number().min(0).max(SHADOW_STRENGTH_MAX).optional(),
    shadowSpread: z.number().min(0).max(SHADOW_SPREAD_MAX).optional(),
    shadowBlur: z.number().min(0).max(SHADOW_BLUR_MAX).optional(),
    shadowX: z.number().min(-SHADOW_OFFSET_MAX).max(SHADOW_OFFSET_MAX).optional(),
    shadowY: z.number().min(-SHADOW_OFFSET_MAX).max(SHADOW_OFFSET_MAX).optional(),
  })
  .strict()

/** A picture layer: the carousel's, with an outline, a glow and colour. */
const thumbnailPictureSchema = carouselMediaItemSchema
  .extend({
    ...boxSchema,
    type: z.literal("image"),
    outlineColor: colorSchema.optional(),
    outlineWidth: z.number().min(0).max(OUTLINE_WIDTH_MAX).optional(),
    glowColor: colorSchema.optional(),
    brightness: z.number().min(MIN_CLIP_BRIGHTNESS).max(MAX_CLIP_BRIGHTNESS).optional(),
    contrast: z.number().min(MIN_CLIP_CONTRAST).max(MAX_CLIP_CONTRAST).optional(),
    saturation: z.number().min(MIN_CLIP_SATURATION).max(MAX_CLIP_SATURATION).optional(),
  })
  .strict()

const thumbnailShadeSchema = carouselGradientShadowItemSchema
  .extend(boxSchema)
  .strict()

/**
 * An arrow or a circle. Its two points are shares of its own box, so moving
 * or resizing the box carries the shape with it.
 */
const thumbnailShapeSchema = z
  .object({
    ...boxSchema,
    type: z.literal("shape"),
    shape: z.enum(["arrow", "circle"]),
    fromX: z.number().min(0).max(1),
    fromY: z.number().min(0).max(1),
    toX: z.number().min(0).max(1),
    toY: z.number().min(0).max(1),
    color: colorSchema,
    lineWidth: z.number().min(MIN_SHAPE_LINE_WIDTH).max(MAX_SHAPE_LINE_WIDTH),
  })
  .strict()

/** Where a template's picture goes. Starting from it fills it with a frame. */
const thumbnailSpotSchema = z
  .object({ ...boxSchema, type: z.literal("spot") })
  .strict()

export const thumbnailLayerSchema = z.discriminatedUnion("type", [
  thumbnailTextSchema,
  thumbnailPictureSchema,
  thumbnailShadeSchema,
  thumbnailShapeSchema,
  thumbnailSpotSchema,
])

export const thumbnailLayersSchema = z.array(thumbnailLayerSchema).max(THUMBNAIL_LAYER_MAX)

export type ThumbnailLayer = z.infer<typeof thumbnailLayerSchema>
export type ThumbnailText = z.infer<typeof thumbnailTextSchema>
export type ThumbnailPicture = z.infer<typeof thumbnailPictureSchema>
export type ThumbnailShapeLayer = z.infer<typeof thumbnailShapeSchema>

export type ThumbnailDesign = {
  shape: ThumbnailShape
  backgroundColor: string
  layers: ThumbnailLayer[]
}

/** The stored layers, or none when they no longer read. */
export function readThumbnailLayers(value: unknown): ThumbnailLayer[] {
  const parsed = thumbnailLayersSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

/**
 * The carousel layer a thumbnail layer is drawn as, without the board's own
 * settings, or null for the board's own kinds.
 */
export function asCarouselItem(layer: ThumbnailLayer): CarouselSlideItem | null {
  if (layer.type === "text") {
    const {
      shadow: _shadow,
      shadowColor: _color,
      shadowOpacity: _opacity,
      shadowBlur: _blur,
      shadowX: _x,
      shadowY: _y,
      shadowSpread: _spread,
      ...item
    } = layer
    return item
  }
  if (layer.type === "image") {
    const {
      outlineColor: _outline,
      outlineWidth: _width,
      glowColor: _glow,
      brightness: _brightness,
      contrast: _contrast,
      saturation: _saturation,
      ...item
    } = layer
    return item
  }
  if (layer.type === "gradient-shadow") return layer
  return null
}

function pictureColour(layer: ThumbnailPicture): ClipColour {
  return {
    brightness: layer.brightness ?? 0,
    contrast: layer.contrast ?? 1,
    saturation: layer.saturation ?? 1,
  }
}

function colourTouched(colour: ClipColour) {
  return colour.brightness !== 0 || colour.contrast !== 1 || colour.saturation !== 1
}

/**
 * The SVG filter for a layer's board-only looks, or null when it has none.
 * `scale` is screen pixels to a full-size pixel: 1 in the download, smaller
 * on the board. The filter covers the layer's box and a margin round it, so
 * an outline or a glow reaches past the box.
 *
 * An outline is the picture's see-through edge blurred and then made solid
 * again: a blur of 0.7 of the width, read back at 12 times its strength,
 * reaches about the width out. A real "grow the shape" step (feMorphology)
 * draws the same ring but took 17 seconds for one 20-pixel outline in
 * resvg, against well under a second this way.
 */
export function layerEffectFilter(
  layer: ThumbnailLayer,
  id: string,
  frame: { width: number; height: number },
  scale: number,
  /** On screen the filter sits on the layer's own box, so it counts from its corner. */
  fromLayerCorner = false
): string | null {
  const steps: string[] = []
  let source = "SourceGraphic"
  let margin = 0
  const px = (value: number) => (value * scale).toFixed(2)
  if (layer.type === "image") {
    const colour = pictureColour(layer)
    if (colourTouched(colour)) {
      steps.push(
        `<feColorMatrix in="SourceGraphic" type="matrix" values="${colourMatrix(colour).map((value) => Number(value.toFixed(5))).join(" ")}" result="coloured"/>`
      )
      source = "coloured"
    }
    const merged: string[] = []
    if (layer.glowColor) {
      steps.push(
        `<feGaussianBlur in="SourceAlpha" stdDeviation="${px(22)}" result="glowblur"/>`,
        `<feComponentTransfer in="glowblur" result="glowalpha"><feFuncA type="linear" slope="2.5"/></feComponentTransfer>`,
        `<feFlood flood-color="${layer.glowColor}"/>`,
        `<feComposite in2="glowalpha" operator="in" result="glow"/>`
      )
      merged.push("glow")
      margin = Math.max(margin, 80)
    }
    if (layer.outlineColor && layer.outlineWidth) {
      steps.push(
        `<feGaussianBlur in="SourceAlpha" stdDeviation="${px(layer.outlineWidth * 0.7)}" result="outlineblur"/>`,
        `<feComponentTransfer in="outlineblur" result="outlinealpha"><feFuncA type="linear" slope="12"/></feComponentTransfer>`,
        `<feFlood flood-color="${layer.outlineColor}"/>`,
        `<feComposite in2="outlinealpha" operator="in" result="outline"/>`
      )
      merged.push("outline")
      margin = Math.max(margin, layer.outlineWidth * 2)
    }
    if (!steps.length) return null
    if (merged.length) {
      steps.push(
        `<feMerge>${[...merged, source].map((name) => `<feMergeNode in="${name}"/>`).join("")}</feMerge>`
      )
    }
  } else if (layer.type === "text" && layer.shadow) {
    const shadow = textShadowOf(layer)
    // The words' shape, grown out on every side by the spread the way an
    // outline is (blurred, then made solid again), moved, softened, then
    // made as dark as its strength. A strength of 0.75 with no spread draws
    // exactly what feDropShadow's flood-opacity 0.75 drew before.
    let shape = "SourceAlpha"
    if (shadow.spread > 0) {
      steps.push(
        `<feGaussianBlur in="SourceAlpha" stdDeviation="${px(shadow.spread * 0.7)}" result="spreadblur"/>`,
        `<feComponentTransfer in="spreadblur" result="spreadalpha"><feFuncA type="linear" slope="12"/></feComponentTransfer>`
      )
      shape = "spreadalpha"
    }
    steps.push(`<feOffset in="${shape}" dx="${px(shadow.x)}" dy="${px(shadow.y)}" result="moved"/>`)
    let soft = "moved"
    if (shadow.blur > 0) {
      steps.push(`<feGaussianBlur in="moved" stdDeviation="${px(shadow.blur)}" result="soft"/>`)
      soft = "soft"
    }
    steps.push(
      `<feComponentTransfer in="${soft}" result="dark"><feFuncA type="linear" slope="${shadow.opacity}"/></feComponentTransfer>`,
      `<feFlood flood-color="${shadow.color}"/>`,
      `<feComposite in2="dark" operator="in" result="shadow"/>`,
      `<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>`
    )
    // Room round the box for the shadow: as far as it is moved and grown,
    // plus about three times its softness, where a blur fades out.
    margin = Math.max(40, Math.max(Math.abs(shadow.x), Math.abs(shadow.y)) + shadow.spread * 2 + shadow.blur * 3)
  } else {
    return null
  }
  const left = ((fromLayerCorner ? 0 : layer.x * frame.width) - margin) * scale
  const top = ((fromLayerCorner ? 0 : layer.y * frame.height) - margin) * scale
  const width = (layer.width * frame.width + margin * 2) * scale
  const height = (layer.height * frame.height + margin * 2) * scale
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" color-interpolation-filters="sRGB">${steps.join("")}</filter>`
}

/** A words layer's drop shadow, with the defaults for anything unset. */
export function textShadowOf(layer: ThumbnailText) {
  return {
    color: layer.shadowColor ?? TEXT_SHADOW_DEFAULTS.color,
    opacity: layer.shadowOpacity ?? TEXT_SHADOW_DEFAULTS.opacity,
    blur: layer.shadowBlur ?? TEXT_SHADOW_DEFAULTS.blur,
    x: layer.shadowX ?? TEXT_SHADOW_DEFAULTS.x,
    y: layer.shadowY ?? TEXT_SHADOW_DEFAULTS.y,
    spread: layer.shadowSpread ?? TEXT_SHADOW_DEFAULTS.spread,
  }
}

/** A new layer's id. */
export function layerId() {
  return Math.random().toString(36).slice(2, 12)
}

/** The next layer sits on top of everything already on the board. */
export function topZ(layers: ThumbnailLayer[]) {
  return layers.reduce((top, layer) => Math.max(top, layer.zIndex + 1), 0)
}

/** A picture filling the whole board, under everything else. */
export function fullPictureLayer(
  picture: { mediaId: string; url: string; name?: string },
  zIndex = 0
): ThumbnailPicture {
  return {
    id: layerId(),
    type: "image",
    mediaId: picture.mediaId,
    url: picture.url,
    altText: picture.name?.slice(0, 500),
    fit: "cover",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    zIndex,
  }
}

/** Every look the Styles row offers on a text layer (part 9). */
export const TEXT_LOOKS = ["outline", "accent", "shadow", "box"] as const
type TextLook = (typeof TEXT_LOOKS)[number]

export const TEXT_LOOK_LABELS: Record<TextLook, string> = {
  outline: "Thick outline",
  accent: "One word in yellow",
  shadow: "Drop shadow",
  box: "Box behind",
}

/** Where the last word of some text starts and ends. */
function lastWordRange(text: string) {
  const match = /(\S+)\s*$/.exec(text)
  if (!match) return null
  return { start: match.index, end: match.index + match[1].length }
}

/** A text layer with one look put on it. */
export function withTextLook(layer: ThumbnailText, look: TextLook): ThumbnailText {
  if (look === "outline") {
    return { ...layer, color: "#ffffff", outlineColor: "#000000", outlineWidth: 12 }
  }
  if (look === "shadow") return { ...layer, shadow: true }
  if (look === "box") return { ...layer, boxColor: "#000000", color: "#ffffff" }
  const word = lastWordRange(layer.text)
  if (!word) return layer
  const marks = (layer.marks ?? []).filter((mark) => mark.style !== "accent")
  return {
    ...layer,
    accentColor: "#ffd60a",
    marks: [...marks, { ...word, style: "accent" }],
  }
}

/** Whether a text layer already wears a look, for the Styles row. */
export function hasTextLook(layer: ThumbnailText, look: TextLook) {
  if (look === "outline") return !!layer.outlineColor && !!layer.outlineWidth
  if (look === "shadow") return !!layer.shadow
  if (look === "box") return !!layer.boxColor
  return (layer.marks ?? []).some((mark) => mark.style === "accent")
}

/** The same layer with one look taken off. */
export function withoutTextLook(layer: ThumbnailText, look: TextLook): ThumbnailText {
  if (look === "outline") {
    const { outlineColor: _color, outlineWidth: _width, ...rest } = layer
    return rest
  }
  if (look === "shadow") {
    const {
      shadow: _shadow,
      shadowColor: _color,
      shadowOpacity: _opacity,
      shadowBlur: _blur,
      shadowX: _x,
      shadowY: _y,
      shadowSpread: _spread,
      ...rest
    } = layer
    return rest
  }
  if (look === "box") {
    const { boxColor: _box, ...rest } = layer
    return rest
  }
  const marks = (layer.marks ?? []).filter((mark) => mark.style !== "accent")
  return { ...layer, marks: marks.length ? marks : undefined }
}

/** A new text layer: big white words near the bottom of the board. */
export function newTextLayer(shape: ThumbnailShape, layers: ThumbnailLayer[], text = "BIG WORDS"): ThumbnailText {
  const tall = shape === "tall"
  return {
    id: layerId(),
    type: "text",
    text,
    fontId: "anton",
    fontSize: tall ? 150 : 120,
    color: "#ffffff",
    align: "left",
    outlineColor: "#000000",
    outlineWidth: 10,
    x: 0.05,
    y: tall ? 0.6 : 0.55,
    width: 0.9,
    height: tall ? 0.25 : 0.4,
    zIndex: topZ(layers),
  }
}

export function newShapeLayer(kind: "arrow" | "circle", layers: ThumbnailLayer[]): ThumbnailShapeLayer {
  return {
    id: layerId(),
    type: "shape",
    shape: kind,
    fromX: kind === "arrow" ? 0 : 0,
    fromY: kind === "arrow" ? 1 : 0,
    toX: 1,
    toY: kind === "arrow" ? 0 : 1,
    color: "#ff3b30",
    lineWidth: 16,
    x: 0.55,
    y: 0.2,
    width: 0.25,
    height: 0.3,
    zIndex: topZ(layers),
  }
}

/** A template's layers: pictures become empty spots, everything else stays. */
export function templateLayers(layers: ThumbnailLayer[]): ThumbnailLayer[] {
  return layers.map((layer) =>
    layer.type === "image"
      ? {
          id: layer.id,
          type: "spot",
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          zIndex: layer.zIndex,
        }
      : layer
  )
}

/** A template's spots filled with one picture, cropped into each. */
export function fillSpots(
  layers: ThumbnailLayer[],
  picture: { mediaId: string; url: string; name?: string } | null
): ThumbnailLayer[] {
  return layers.flatMap((layer) => {
    if (layer.type !== "spot") return [layer]
    if (!picture) return []
    return [
      {
        ...fullPictureLayer(picture, layer.zIndex),
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      },
    ]
  })
}

/** Every word written on a thumbnail, top to bottom. */
export function thumbnailWords(layers: ThumbnailLayer[]) {
  return layers
    .filter((layer): layer is ThumbnailText => layer.type === "text" && !layer.hidden)
    .sort((a, b) => a.y - b.y)
    .map((layer) => layer.text.trim())
    .filter(Boolean)
    .join(" ")
}
