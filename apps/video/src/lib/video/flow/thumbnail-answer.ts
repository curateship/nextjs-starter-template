import { z } from "zod"

import { TEXT_FONT_IDS, type TextFontId } from "@/lib/video/text-fonts"
import {
  fullPictureLayer,
  THUMBNAIL_SIZES,
  type ThumbnailLayer,
  type ThumbnailShape,
} from "@/lib/video/thumbnails"

/**
 * The AI thumbnail's answer (flow.md, "AI thumbnail"): the picture under it,
 * an optional AI change to that picture, a shade, and the layers of words and
 * rings over it, all from its prompt, laid with the Thumbnail board's own
 * layers. Before 14 Nov 2026 the node always turned a frame into a "main
 * person" photo with the words in the accent look; that is now just what the
 * Transcript to video starter's prompt asks for.
 */

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const share = z.number().min(0).max(1)

const textLayer = z.object({
  type: z.literal("text"),
  text: z.string().trim().min(1).max(120),
  font: z.enum(TEXT_FONT_IDS).default("anton"),
  size: z.number().min(8).max(220).default(110),
  color: color.default("#ffffff"),
  /** The middle of the words, as shares of the board. */
  x: share.default(0.5),
  y: share.default(0.5),
  align: z.enum(["left", "center", "right"]).default("center"),
  outline: z.boolean().default(false),
})

const ringLayer = z.object({
  type: z.literal("ring"),
  x: share.default(0.5),
  y: share.default(0.5),
  /** Its width across, as a share of the board's height. */
  size: z.number().min(0.05).max(1).default(0.5),
  width: z.number().min(2).max(40).default(8),
  color: color.default("#ffffff"),
})

export const thumbnailAnswerSchema = z.object({
  /** A connected picture by name (P1), or "frame" for a moment of the run's video. */
  base: z.string().min(1).max(12).default("frame"),
  frame_at: z.number().min(0).default(0),
  /** A change to the base picture by AI, or none to keep it as it is. */
  edit: z.string().max(600).optional(),
  shade: z.enum(["top", "bottom", "none"]).default("none"),
  layers: z.array(z.discriminatedUnion("type", [textLayer, ringLayer])).max(12).default([]),
})

export type ThumbnailAnswer = z.infer<typeof thumbnailAnswerSchema>

export const THUMBNAIL_ANSWER = `Reply with JSON only, in this shape:
{"base": "P1", "frame_at": 0, "edit": "", "shade": "top", "layers": [{"type": "text", "text": "WORDS", "font": "fredoka", "size": 110, "color": "#ffffff", "x": 0.5, "y": 0.1, "align": "center", "outline": false}, {"type": "ring", "x": 0.5, "y": 0.55, "size": 0.55, "width": 8, "color": "#ffffff"}]}
"base" is a connected picture (P1, P2…) or "frame" for the moment "frame_at" (seconds) of the video. "edit" changes the picture by AI; leave it out to keep the picture as it is. x and y are the middle of a layer, 0 to 1 across and down; size is in pixels on a 1280 by 720 board (text) or a share of its height (ring). Fonts: ${TEXT_FONT_IDS.join(", ")}. Only put on what the prompt asks for.`

/**
 * The board's layers for an answer: the picture filling it, the shade, then
 * each word and ring, centred where the answer says.
 */
export function thumbnailLayersFrom(
  answer: ThumbnailAnswer,
  picture: { mediaId: string; url: string; name?: string },
  shape: ThumbnailShape
): ThumbnailLayer[] {
  const board = THUMBNAIL_SIZES[shape]
  const layers: ThumbnailLayer[] = [fullPictureLayer(picture, 0)]
  let z = 1
  if (answer.shade !== "none") {
    layers.push({
      id: `shade-${z}`,
      type: "gradient-shadow",
      color: "#000000",
      opacity: 70,
      direction: answer.shade === "top" ? "down" : "up",
      x: 0,
      y: answer.shade === "top" ? 0 : 0.55,
      width: 1,
      height: 0.45,
      zIndex: z++,
    })
  }
  for (const layer of answer.layers) {
    if (layer.type === "text") {
      const height = Math.min(0.9, (layer.size * 1.4) / board.height)
      const width = 0.9
      layers.push({
        id: `words-${z}`,
        type: "text",
        text: layer.text,
        fontId: layer.font as TextFontId,
        fontSize: layer.size,
        color: layer.color,
        align: layer.align,
        ...(layer.outline ? { outlineColor: "#000000", outlineWidth: 8 } : {}),
        x: layer.align === "center" ? layer.x - width / 2 : layer.align === "right" ? layer.x - width : layer.x,
        y: layer.y - height / 2,
        width,
        height,
        zIndex: z++,
      })
      continue
    }
    // A true circle: as wide in pixels as it is tall.
    const height = layer.size
    const width = (layer.size * board.height) / board.width
    layers.push({
      id: `ring-${z}`,
      type: "shape",
      shape: "circle",
      fromX: 0,
      fromY: 0,
      toX: 1,
      toY: 1,
      color: layer.color,
      lineWidth: layer.width,
      x: layer.x - width / 2,
      y: layer.y - height / 2,
      width,
      height,
      zIndex: z++,
    })
  }
  return layers
}
