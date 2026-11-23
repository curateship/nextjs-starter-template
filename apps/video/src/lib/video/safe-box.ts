import { z } from "zod"

import type { AspectRatio } from "@/lib/video/timeline-schema"
import { requireTextFont, type TextFontId } from "@/lib/video/text-fonts"
import {
  guessLineWidth,
  TEXT_LINE_HEIGHT,
  TEXT_WRAP_WIDTH,
  TEXT_WRAP_WIDTH_MIN,
  wrapTextLines,
} from "@/lib/video/text-lines"
import { DESIGN_HEIGHT } from "@/lib/video/timeline-utils"

/**
 * The safe box: the part of a tall frame each platform leaves clear of its own
 * buttons, names and caption, so words placed inside it are never under them.
 *
 * Each platform's box is four numbers, how far in from each edge its own
 * things reach, in pixels on a 1080 by 1920 frame. None of the platforms
 * publishes them as a spec of their own, so they are settings anyone can
 * change on Settings → Captions, and these are only where they start.
 *
 * Only tall (9:16) video has a box. Tyler chose that on 23 Sep 2026 for the
 * old stage guides, because the platforms say nothing about other shapes, and
 * again on 21 Oct 2026 for this.
 */

export const SAFE_BOX_PLATFORMS = [
  { id: "tiktok", label: "TikTok" },
  { id: "reels", label: "Instagram Reels" },
  { id: "shorts", label: "YouTube Shorts" },
] as const

export type SafeBoxPlatformId = (typeof SAFE_BOX_PLATFORMS)[number]["id"]

export const SAFE_BOX_PLATFORM_IDS = SAFE_BOX_PLATFORMS.map(
  (platform) => platform.id
) as [SafeBoxPlatformId, ...SafeBoxPlatformId[]]

export const SAFE_BOX_EDGES = ["top", "bottom", "left", "right"] as const

export type SafeBox = Record<(typeof SAFE_BOX_EDGES)[number], number>
export type SafeBoxes = Record<SafeBoxPlatformId, SafeBox>

/** The frame the numbers are measured on. */
export const SAFE_BOX_FRAME = { width: 1080, height: 1920 } as const

/** The only shape a box applies to. */
export const SAFE_BOX_ASPECT: AspectRatio = "9:16"

/**
 * Where the numbers start. Read from the figures gathered in the task on
 * 21 Oct 2026, taking the cautious end of each range given:
 *
 * - TikTok: its bottom 320 to 350 pixels and its right 120 to 164 are
 *   covered. No figure was given for its top or left, so those start at 0.
 * - Reels: its bottom 310 to 450 and its right 120. Meta's own ads spec says
 *   the top 14 out of 100 and the sides 6 out of 100, which is 269 and 65
 *   pixels; its bottom 35 out of 100 is for ads, so the 450 is used instead.
 * - Shorts: its bottom 300 and its right about 48. No top or left figure.
 */
export const DEFAULT_SAFE_BOXES: SafeBoxes = {
  tiktok: { top: 0, bottom: 350, left: 0, right: 164 },
  reels: { top: 269, bottom: 450, left: 65, right: 120 },
  shorts: { top: 0, bottom: 300, left: 0, right: 48 },
}

/**
 * The box must leave room for words: at least the narrowest a caption may
 * wrap across, and at least a fifth of the frame's height.
 */
const SAFE_BOX_MAX_ACROSS = Math.floor(
  SAFE_BOX_FRAME.width * (1 - TEXT_WRAP_WIDTH_MIN)
)
const SAFE_BOX_MAX_DOWN = Math.floor(SAFE_BOX_FRAME.height * 0.8)

export const SAFE_BOX_TOO_NARROW_MESSAGE = `Left and right together can cover at most ${SAFE_BOX_MAX_ACROSS} of the 1080 pixels, so a caption still has room`
export const SAFE_BOX_TOO_SHORT_MESSAGE = `Top and bottom together can cover at most ${SAFE_BOX_MAX_DOWN} of the 1920 pixels, so a caption still has room`

const edgeSchema = (most: number) => z.number().int().min(0).max(most)

export const safeBoxSchema = z
  .object({
    top: edgeSchema(SAFE_BOX_MAX_DOWN),
    bottom: edgeSchema(SAFE_BOX_MAX_DOWN),
    left: edgeSchema(SAFE_BOX_MAX_ACROSS),
    right: edgeSchema(SAFE_BOX_MAX_ACROSS),
  })
  .strict()
  .refine((box) => box.left + box.right <= SAFE_BOX_MAX_ACROSS, {
    message: SAFE_BOX_TOO_NARROW_MESSAGE,
  })
  .refine((box) => box.top + box.bottom <= SAFE_BOX_MAX_DOWN, {
    message: SAFE_BOX_TOO_SHORT_MESSAGE,
  })

export const safeBoxesSchema = z
  .object({
    tiktok: safeBoxSchema,
    reels: safeBoxSchema,
    shorts: safeBoxSchema,
  })
  .strict()

/**
 * The saved boxes, or the starting numbers when nothing is saved. A platform
 * whose saved numbers no longer read takes its starting numbers, so one bad
 * row never stops every project from opening.
 */
export function readSafeBoxes(value: unknown): SafeBoxes {
  if (!value || typeof value !== "object") return DEFAULT_SAFE_BOXES
  const saved = value as Record<string, unknown>
  const boxes = { ...DEFAULT_SAFE_BOXES }
  for (const id of SAFE_BOX_PLATFORM_IDS) {
    const read = safeBoxSchema.safeParse(saved[id])
    if (read.success) boxes[id] = read.data
  }
  return boxes
}

/** The first problem with one platform's numbers, in words, or null. */
export function safeBoxProblem(box: SafeBox): string | null {
  const result = safeBoxSchema.safeParse(box)
  if (result.success) return null
  const issue = result.error.issues[0]
  if (issue?.code === "custom") return issue.message
  // One number past the limit on its own is the same problem as two together.
  if (issue?.code === "too_big") {
    return issue.path[0] === "left" || issue.path[0] === "right"
      ? SAFE_BOX_TOO_NARROW_MESSAGE
      : SAFE_BOX_TOO_SHORT_MESSAGE
  }
  return "Each number is whole pixels, from 0 up"
}

/** The box as shares of the frame, 0 to 1 from each edge. */
export function safeBoxShares(box: SafeBox) {
  return {
    top: box.top / SAFE_BOX_FRAME.height,
    bottom: box.bottom / SAFE_BOX_FRAME.height,
    left: box.left / SAFE_BOX_FRAME.width,
    right: box.right / SAFE_BOX_FRAME.width,
  }
}

/** Rounded so a saved timeline does not carry sixteen digits. */
function share(value: number) {
  return Math.round(value * 10_000) / 10_000
}

/**
 * Where one caption sits once it is kept inside a box: across the middle of
 * the box, wrapping no wider than the box, and at the height asked for unless
 * that would put its top or bottom edge outside the box. A caption too tall
 * for the box sits in the box's middle.
 *
 * The caption's height is guessed from how many lines its words take at an
 * average letter width, plus the block of colour behind it and its outline.
 * The guess leans wide, so it counts a line too many before one too few.
 */
export function placeInSafeBox(
  caption: {
    text: string
    fontId: TextFontId
    /** In the 1080-tall design space. */
    fontSize: number
    boxed: boolean
    strokeWidth: number
    /** Where the middle of the words was asked to sit, 0 to 1. */
    y: number
  },
  box: SafeBox
): { x: number; y: number; wrapWidth?: number } {
  const edges = safeBoxShares(box)
  const across = 1 - edges.left - edges.right
  const wrapWidth = Math.min(TEXT_WRAP_WIDTH, across)
  const frameWidth =
    (DESIGN_HEIGHT * SAFE_BOX_FRAME.width) / SAFE_BOX_FRAME.height
  // The box behind boxed words takes its padding out of the line's width.
  const lines = wrapTextLines(
    caption.text,
    frameWidth * wrapWidth - (caption.boxed ? caption.fontSize * 0.9 : 0),
    guessLineWidth(requireTextFont(caption.fontId), caption.fontSize)
  )
  const height =
    lines.length * caption.fontSize * TEXT_LINE_HEIGHT +
    (caption.boxed ? caption.fontSize * 0.4 : 0) +
    caption.strokeWidth * 2
  const half = height / 2 / DESIGN_HEIGHT
  const highest = edges.top + half
  const lowest = 1 - edges.bottom - half
  const y =
    highest > lowest
      ? (edges.top + 1 - edges.bottom) / 2
      : Math.min(lowest, Math.max(highest, caption.y))
  return {
    x: share(edges.left + across / 2),
    y: share(y),
    ...(wrapWidth < TEXT_WRAP_WIDTH ? { wrapWidth: share(wrapWidth) } : {}),
  }
}
