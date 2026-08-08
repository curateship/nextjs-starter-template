/**
 * The brand kit: the colours, logo, watermark and end card every project in
 * this install is finished with, and whether every export is brought to the
 * same loudness. One saved JSON document, read field by field through the
 * normalizer below.
 *
 * Reading this way is what lets a later feature add a field — a watermark
 * position, a caption style — without a migration and without breaking a
 * document saved before it existed: the missing field simply takes its default.
 */

import { DEFAULT_NORMALIZE_LOUDNESS } from "./audio-loudness"

export type BrandColor = { name: string; value: string }

/**
 * The logo is kept as the address of a file in the media library, which is how
 * every other picked image in this app is stored — the shared image field hands
 * back an address, and one field type that behaves differently would be its own
 * kind of bug.
 */
export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

export const WATERMARK_POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
]

export type VideoBrandKit = {
  colors: BrandColor[]
  logoUrl: string
  /** The logo sat in a corner of every exported video. */
  watermark: {
    enabled: boolean
    position: WatermarkPosition
    /** How wide, as a share of the frame. */
    widthPercent: number
    opacity: number
  }
  /** A few seconds on the end of every export: the logo, and a line to act on. */
  endCard: {
    enabled: boolean
    durationSeconds: number
    backgroundColor: string
    ctaText: string
  }
  /** Level every export to what the platforms play videos at. */
  normalizeLoudness: boolean
}

export const MAX_BRAND_COLORS = 12
export const END_CARD_TEXT_MAX = 200
export const BRAND_LOGO_URL_MAX = 2048
export const BRAND_COLOR_NAME_MAX = 40

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function isBrandColorValue(value: string) {
  return HEX_COLOR.test(value)
}

export function createDefaultBrandKit(): VideoBrandKit {
  return {
    colors: [
      { name: "Primary", value: "#111827" },
      { name: "Accent", value: "#22c55e" },
      { name: "Caption", value: "#ffffff" },
      { name: "Box", value: "#000000" },
    ],
    logoUrl: "",
    watermark: {
      enabled: false,
      position: "bottom-right",
      widthPercent: 16,
      opacity: 80,
    },
    endCard: {
      enabled: false,
      durationSeconds: 3,
      backgroundColor: "#111827",
      ctaText: "",
    },
    normalizeLoudness: DEFAULT_NORMALIZE_LOUDNESS,
  }
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}

export function normalizeBrandKit(value: unknown): VideoBrandKit {
  const fallback = createDefaultBrandKit()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const saved = value as Partial<VideoBrandKit>

  // A colour with no name or an unusable value is dropped rather than drawn as
  // a broken swatch. An empty list is allowed — someone may want no palette.
  const colors = Array.isArray(saved.colors)
    ? saved.colors
        .filter(
          (color): color is BrandColor =>
            !!color &&
            typeof color === "object" &&
            typeof color.name === "string" &&
            color.name.trim().length > 0 &&
            typeof color.value === "string" &&
            isBrandColorValue(color.value)
        )
        .slice(0, MAX_BRAND_COLORS)
        .map((color) => ({
          name: color.name.trim().slice(0, BRAND_COLOR_NAME_MAX),
          value: color.value,
        }))
    : fallback.colors

  return {
    colors,
    logoUrl:
      typeof saved.logoUrl === "string" &&
      saved.logoUrl.length <= BRAND_LOGO_URL_MAX
        ? saved.logoUrl
        : fallback.logoUrl,
    watermark: {
      enabled:
        typeof saved.watermark?.enabled === "boolean"
          ? saved.watermark.enabled
          : fallback.watermark.enabled,
      position: WATERMARK_POSITIONS.some(
        (option) => option.id === saved.watermark?.position
      )
        ? (saved.watermark!.position as WatermarkPosition)
        : fallback.watermark.position,
      widthPercent: clampNumber(
        saved.watermark?.widthPercent,
        4,
        50,
        fallback.watermark.widthPercent
      ),
      opacity: clampNumber(
        saved.watermark?.opacity,
        10,
        100,
        fallback.watermark.opacity
      ),
    },
    endCard: {
      enabled:
        typeof saved.endCard?.enabled === "boolean"
          ? saved.endCard.enabled
          : fallback.endCard.enabled,
      durationSeconds: clampNumber(
        saved.endCard?.durationSeconds,
        1,
        10,
        fallback.endCard.durationSeconds
      ),
      backgroundColor:
        typeof saved.endCard?.backgroundColor === "string" &&
        isBrandColorValue(saved.endCard.backgroundColor)
          ? saved.endCard.backgroundColor
          : fallback.endCard.backgroundColor,
      ctaText:
        typeof saved.endCard?.ctaText === "string"
          ? saved.endCard.ctaText.slice(0, END_CARD_TEXT_MAX)
          : fallback.endCard.ctaText,
    },
    normalizeLoudness:
      typeof saved.normalizeLoudness === "boolean"
        ? saved.normalizeLoudness
        : fallback.normalizeLoudness,
  }
}
