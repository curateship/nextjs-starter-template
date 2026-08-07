/**
 * The brand kit: the colours and logo every project in this install
 * draws with. One saved JSON document, read field by field through the
 * normalizer below.
 *
 * Reading this way is what lets a later feature add a field — a watermark
 * position, a caption style — without a migration and without breaking a
 * document saved before it existed: the missing field simply takes its default.
 */

export type BrandColor = { name: string; value: string }

/**
 * The logo is kept as the address of a file in the media library, which is how
 * every other picked image in this app is stored — the shared image field hands
 * back an address, and one field type that behaves differently would be its own
 * kind of bug.
 */
export type VideoBrandKit = {
  colors: BrandColor[]
  logoUrl: string
}

export const MAX_BRAND_COLORS = 12
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
  }
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
  }
}
