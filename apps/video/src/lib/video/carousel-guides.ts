import type { CarouselFormat } from "@/lib/video/carousel-schema"

/**
 * Where Instagram covers or cuts off part of a slide, as fractions of the
 * slide. The canvas shades these when the guides are on; they are never part
 * of the carousel or its export (workspace/docs/carousel-guides.md).
 */

export type GuideZone = { x: number; y: number; width: number; height: number }

export type InstagramGuide = {
  label: string
  /** What the shaded parts mean, in a line under the switch. */
  note: string
  source: string
  zones: GuideZone[]
}

// Meta's Ads Guide for Instagram Stories, read 21 Oct 2026: "leave roughly
// 14% of the top, 35% of the bottom, and 6% on each side" free of text and
// logos, because the account name, the reply box and the buttons sit there.
// https://www.facebook.com/business/ads-guide/update/image/instagram-story
const STORY = { top: 0.14, bottom: 0.35, side: 0.06 }

// The profile grid shows every post as a 3:4 tile cut from its middle.
// Instagram published no page with the number; it comes from Adam Mosseri's
// Instagram story of January 2025, as reported by Inquirer and exchange4media
// and read 21 Oct 2026.
const GRID_TILE_RATIO = 3 / 4

const FORMAT_RATIOS: Record<CarouselFormat, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "9:16": 9 / 16,
}

export function instagramGuide(format: CarouselFormat): InstagramGuide {
  if (format === "9:16") {
    return {
      label: "Story buttons",
      note: "Instagram draws the account name, the reply box and its buttons over the shaded parts.",
      source: "Meta Ads Guide, Instagram Stories, read 21 Oct 2026",
      zones: [
        { x: 0, y: 0, width: 1, height: STORY.top },
        { x: 0, y: 1 - STORY.bottom, width: 1, height: STORY.bottom },
        {
          x: 0,
          y: STORY.top,
          width: STORY.side,
          height: 1 - STORY.top - STORY.bottom,
        },
        {
          x: 1 - STORY.side,
          y: STORY.top,
          width: STORY.side,
          height: 1 - STORY.top - STORY.bottom,
        },
      ],
    }
  }
  // A tile narrower than the slide loses its sides; the share lost from each
  // side is half the difference.
  const kept = GRID_TILE_RATIO / FORMAT_RATIOS[format]
  const side = (1 - kept) / 2
  return {
    label: "Profile grid crop",
    note: "Your profile grid cuts the shaded sides off the first slide's tile.",
    source:
      "Adam Mosseri's Instagram story, January 2025, as reported; no Instagram page gives the number",
    zones: [
      { x: 0, y: 0, width: side, height: 1 },
      { x: 1 - side, y: 0, width: side, height: 1 },
    ],
  }
}
